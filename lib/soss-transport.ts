import {
  EventEmitter,
  Options,
  Publisher,
  RomiService,
  RomiTopic,
  Subscription,
  SubscriptionCb,
  Transport,
  TransportEvents,
} from '@osrf/romi-js-core-interfaces';
import { Subject } from 'rxjs/internal/Subject';
import { filter, take } from 'rxjs/operators';
import { WebSocketSubject } from 'rxjs/webSocket';

export class SossTransport extends EventEmitter<TransportEvents> implements Transport {
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
      // need this so that rxjs fires the close event, we need to close event in order to get the
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

  get name(): string {
    return this._name;
  }

  createPublisher<Message>(topic: RomiTopic<Message>, options?: Options): Publisher<Message> {
    if (options !== undefined) throw new Error('options are not supported yet');

    return {
      publish: (msg: unknown): void => {
        const pubMsg: PubMsg = {
          op: 'publish',
          topic: this._trimTopic(topic.topic),
          type: this._toRosType(topic.type),
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

    let pubSubject = this._pubSubjects.get(topic.topic);
    if (!pubSubject) {
      const subMsg: SubMsg = {
        op: 'subscribe',
        topic: this._trimTopic(topic.topic),
        type: this._toRosType(topic.type),
      };
      this._wsSubject.next(subMsg);

      pubSubject = new Subject<PubMsg>();
      this._wsSubject.subscribe(msg => {
        if (msg.op === 'publish') {
          pubSubject?.next(msg as PubMsg);
        }
      });
      this._pubSubjects.set(topic.topic, pubSubject);
    }

    return pubSubject.subscribe(msg => cb(topic.validate(msg.msg)));
  }

  async call<Request extends object, Response extends object>(
    service: RomiService<Request, Response>,
    req: Request,
  ): Promise<Response> {
    const callId = (this._serviceCallCount++).toString();
    const serviceCallMsg: ServiceCallMsg = {
      op: 'call_service',
      id: callId,
      service: this._trimTopic(service.service),
      args: req,
    };
    this._wsSubject.next(serviceCallMsg);
    return new Promise<Response>(res => {
      this._wsSubject
        .pipe(
          filter(msg => msg.op === 'service_response' && (msg as ServiceResponseMsg).id === callId),
          take(1),
        )
        .subscribe(msg => {
          res(service.validateResponse((msg as ServiceResponseMsg).values));
        });
    });
  }

  async destroy(): Promise<void> {
    const p = new Promise<void>(res => {
      this._wsSubject.subscribe({
        complete: res,
      });
    });
    this._wsSubject.complete();
    return p;
  }

  private _name: string;
  private _wsSubject: WebSocketSubject<RosBridgeMsg>;
  private _pubSubjects = new Map<string, Subject<PubMsg>>();
  private _serviceCallCount = 0;

  private constructor(name: string, webSocketSubject: WebSocketSubject<RosBridgeMsg>) {
    super();
    this._name = name;
    this._wsSubject = webSocketSubject;
  }

  private _trimTopic(topic: string): string {
    const idx = topic.search(/\w/);
    return topic.slice(idx);
  }

  private _toRosType(typeClass: string): string {
    const parts = typeClass.split('/');
    return `${parts[0]}/${parts[parts.length - 1]}`;
  }
}

interface RosBridgeMsg {
  op: string;
}

interface PubMsg extends RosBridgeMsg {
  op: 'publish';
  topic: string;
  type: string;
  msg: unknown;
}

interface SubMsg extends RosBridgeMsg {
  op: 'subscribe';
  topic: string;
  type: string;
}

interface ServiceCallMsg extends RosBridgeMsg {
  op: 'call_service';
  id: string;
  service: string;
  args: unknown;
}

interface ServiceResponseMsg extends RosBridgeMsg {
  op: 'service_response';
  id: string;
  service: string;
  values: unknown;
}
