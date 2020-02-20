import {
  Options,
  Publisher,
  RomiService,
  RomiTopic,
  Subscription,
  SubscriptionCb,
  Transport,
  Type,
} from '@osrf/romi-js-core-interfaces';
import { filter, take } from 'rxjs/operators';
import { WebSocketSubject } from 'rxjs/webSocket';

export class SossTransport implements Transport {
  get name(): string { return this._name; }

  constructor(name: string, url: string, token: string) {
    this._name = name;
    this._wsSubject = new WebSocketSubject<any>({
      url: url,
      protocol: token,
    });
    this._wsSubject.subscribe(msg => this._onMsg(msg as RosBridgeMsg));
  }

  createPublisher<MessageType extends Type>(
    topic: RomiTopic<MessageType>,
    options?: Options,
  ): Publisher<InstanceType<MessageType>> {
    if (options !== undefined)
      throw new Error('options are not supported yet');

    return {
      publish: (msg: any): void => {
        const pubMsg: PubMsg = {
          op: 'publish',
          topic: this._trimTopic(topic.topic),
          type: this._toRosType(topic.type),
          msg: msg,
        };
        this._wsSubject.next(pubMsg);
      }
    };
  }

  subscribe<MessageType extends Type>(
    topic: RomiTopic<MessageType>,
    cb: SubscriptionCb<InstanceType<MessageType>>,
    options?: Options,
  ): Subscription {
    if (options !== undefined)
      throw new Error('options are not supported yet');

    let subscription = this._subscriptions.get(topic.topic);
    if (!subscription) {
      subscription = [];
      this._subscriptions.set(topic.topic, subscription);
    }
    subscription.push(cb);
    const subMsg: SubMsg = {
      op: 'subscribe',
      topic: this._trimTopic(topic.topic),
      type: this._toRosType(topic.type),
    };
    this._wsSubject.next(subMsg);
    return {
      unsubscribe: (): void => {
        const sub = this._subscriptions.get(topic.topic);
        if (sub) {
          delete sub[sub.indexOf(cb)];
        }
      }
    };
  }

  call<RequestType extends Type, ResponseType extends Type>(
    service: RomiService<RequestType, ResponseType>,
    req: InstanceType<RequestType>,
  ): Promise<InstanceType<ResponseType>> {
    const callId = (this._serviceCallCount++).toString();
    const serviceCallMsg: ServiceCallMsg = {
      op: 'call_service',
      id: callId,
      service: this._trimTopic(service.service),
      args: req,
    };
    this._serviceCallCount++;
    this._wsSubject.next(serviceCallMsg);
    return new Promise(res => {
      this._wsSubject.pipe(filter(msg => {
        return (msg as ServiceCallMsg).id === callId;
      }), take(1)).subscribe(res);
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
  private _wsSubject: WebSocketSubject<any>;
  private _subscriptions = new Map<string, SubscriptionCb<any>[]>();
  private _serviceCallCount = 0;

  private _onMsg(msg: RosBridgeMsg): void {
    switch (msg.op) {
      case 'publish': {
        const pubMsg = msg as PubMsg;
        const subscriptions = this._subscriptions.get(pubMsg.topic);
        if (subscriptions) {
          for (const cb of subscriptions)
            cb(pubMsg.msg);
        }
        break;
      }
    }
  }

  private _trimTopic(topic: string): string {
    const idx = topic.search(/\w/);
    return topic.slice(idx);
  }

  private _toRosType(typeClass: string): string {
    const parts = typeClass.split('/');
    return `${parts[0]}/${parts[parts.length-1]}`;
  }
}

interface RosBridgeMsg {
  op: string;
}

interface PubMsg extends RosBridgeMsg {
  op: 'publish';
  topic: string;
  type: string;
  msg: object;
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
  args: object;
}
