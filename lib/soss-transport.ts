import {
  Options,
  Publisher,
  RomiService,
  RomiTopic,
  Service,
  Subscription,
  SubscriptionCb,
  Transport,
  TransportEvents,
} from '@osrf/romi-js-core-interfaces';
import { filter, take } from 'rxjs/operators';
import { WebSocketSubject } from 'rxjs/webSocket';

enum OpCode {
  publish = 'publish',
  subscribe = 'subscribe',
  unsubscribe = 'unsubscribe',
  serviceCall = 'call_service',
  serviceResponse = 'service_response',
}

export class SossTransport extends TransportEvents implements Transport {
  static async connect(name: string, url: string, token: string): Promise<SossTransport> {
    const p = new Promise<WebSocketSubject<RosBridgeMsg>>((res, rej) => {
      const wsSubject: WebSocketSubject<RosBridgeMsg> = new WebSocketSubject<RosBridgeMsg>({
        url: url,
        protocol: token,
        openObserver: {
          next: () => res(wsSubject),
        },
        closeObserver: {
          next: rej,
        },
      });
      // need this so that rxjs fires the close event, we need the close event in order to get the
      // error code.
      const sub = wsSubject.subscribe({
        error: () => {
          sub.unsubscribe();
        },
      });
    });
    const wsSubject = await p;
    return new SossTransport(name, wsSubject);
  }

  static toSossTopic(topic: RomiTopic<unknown>): string {
    const idx = topic.topic.search(/\w/);
    return topic.topic.slice(idx);
  }

  static toSossService(service: RomiService<unknown, unknown>): string {
    const idx = service.service.search(/\w/);
    return service.service.slice(idx);
  }

  static toSossType(topic: RomiTopic<unknown> | RomiService<unknown, unknown>): string {
    const parts = topic.type.split('/');
    return `${parts[0]}/${parts[parts.length - 1]}`;
  }

  get name(): string {
    return this._name;
  }

  get webSocketSubject(): WebSocketSubject<RosBridgeMsg> {
    return this._wsSubject;
  }

  createPublisher<Message>(topic: RomiTopic<Message>, options?: Options): Publisher<Message> {
    if (options !== undefined) throw new Error('options are not supported yet');

    return {
      publish: (msg: unknown): void => {
        const pubMsg: PubMsg = {
          op: OpCode.publish,
          topic: SossTransport.toSossTopic(topic),
          type: SossTransport.toSossType(topic),
          msg: msg,
        };
        this._wsSubject.next(pubMsg);
      },
    };
  }

  subscribe<Message>(
    topic: RomiTopic<Message>,
    cb: SubscriptionCb<Message>,
    options?: Options,
  ): Subscription {
    if (options !== undefined) {
      throw new Error('options are not supported yet');
    }

    if (!this._subCount[topic.topic]) {
      const subMsg: SubMsg = {
        op: OpCode.subscribe,
        topic: SossTransport.toSossTopic(topic),
        type: SossTransport.toSossType(topic),
      };
      this._wsSubject.next(subMsg);
      if (!(topic.topic in this._subCount)) {
        this._subCount[topic.topic] = 0;
      }
      this._subCount[topic.topic]++;
    }

    const rxSub = this._wsSubject
      .pipe(filter(msg => msg.op === OpCode.publish && (msg as PubMsg).topic === topic.topic))
      .subscribe(msg => cb(topic.validate((msg as PubMsg).msg)));
    return {
      unsubscribe: () => {
        this._subCount[topic.topic]--;
        if (!this._subCount) {
          const unsubMsg: UnsubMsg = {
            op: OpCode.unsubscribe,
            topic: topic.topic,
          };
          this._wsSubject.next(unsubMsg);
        }
        rxSub.unsubscribe();
      },
    };
  }

  async call<Request extends unknown, Response extends unknown>(
    service: RomiService<Request, Response>,
    req: Request,
  ): Promise<Response> {
    const callId = (this._serviceCallCount++).toString();
    const serviceCallMsg: ServiceCallMsg = {
      op: OpCode.serviceCall,
      id: callId,
      service: SossTransport.toSossService(service),
      args: req,
    };
    this._wsSubject.next(serviceCallMsg);
    return new Promise<Response>(res => {
      this._wsSubject
        .pipe(
          filter(msg => msg.op === 'service_response' && (msg as ServiceResponseMsg).id === callId),
          take(1),
        )
        .subscribe(msg => res(service.validateResponse((msg as ServiceResponseMsg).values)));
    });
  }

  createService<Request extends unknown, Response extends unknown>(
    service: RomiService<Request, Response>,
  ): Service<Request, Response> {
    let subscription: ReturnType<SossTransport['_wsSubject']['subscribe']>;
    return {
      start: (handler: (req: Request) => Promise<Response> | Response): void => {
        subscription = this._wsSubject
          .pipe(
            filter(
              msg =>
                msg.op === OpCode.serviceCall &&
                (msg as ServiceCallMsg).service === service.service,
            ),
          )
          .subscribe({
            next: async msg => {
              const result = await handler(service.validateRequest(msg));
              const respMsg: ServiceResponseMsg = {
                op: OpCode.serviceResponse,
                id: (msg as ServiceCallMsg).id,
                service: (msg as ServiceCallMsg).service,
                values: result,
              };
              this._wsSubject.next(respMsg);
            },
          });
      },
      stop: () => subscription.unsubscribe(),
    };
  }

  async destroy(): Promise<void> {
    const p = new Promise<void>(res => {
      this._wsSubject.subscribe({
        complete: () => {
          res();
        },
      });
    });
    this._wsSubject.complete();
    return p;
  }

  private _name: string;
  private _wsSubject: WebSocketSubject<RosBridgeMsg>;
  private _subCount: Record<string, number> = {};
  private _serviceCallCount = 0;

  private constructor(name: string, webSocketSubject: WebSocketSubject<RosBridgeMsg>) {
    super();
    this._name = name;
    this._wsSubject = webSocketSubject;
    this._wsSubject.subscribe({
      complete: () => this.emit('close'),
      error: e => this.emit('error', e),
    });
  }
}

export interface RosBridgeMsg {
  op: string;
}

export interface PubMsg extends RosBridgeMsg {
  op: OpCode.publish;
  topic: string;
  type: string;
  msg: unknown;
}

export interface SubMsg extends RosBridgeMsg {
  op: OpCode.subscribe;
  topic: string;
  type: string;
}

export interface UnsubMsg extends RosBridgeMsg {
  op: OpCode.unsubscribe;
  topic: string;
}

export interface ServiceCallMsg extends RosBridgeMsg {
  op: OpCode.serviceCall;
  id: string;
  service: string;
  args: unknown;
}

export interface ServiceResponseMsg extends RosBridgeMsg {
  op: OpCode.serviceResponse;
  id: string;
  service: string;
  values: unknown;
}
