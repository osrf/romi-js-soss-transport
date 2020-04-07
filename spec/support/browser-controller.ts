/* eslint-disable @typescript-eslint/no-explicit-any */

import { RomiService, RomiTopic } from '@osrf/romi-js-core-interfaces';
import { WebDriver } from 'selenium-webdriver';
import * as romi from '../../lib';
import { SetBoolRequest, SetBoolResponse, StdmsgString } from './test-interfaces';

function _evalTopic<T extends RomiTopic<unknown>>(topic: T): T {
  (topic.validate as any) = window.eval(topic.validate as any);
  return topic;
}

function _evalService<T extends RomiService<unknown, unknown>>(service: T): T {
  (service.validateRequest as any) = window.eval(service.validateRequest as any);
  (service.validateResponse as any) = window.eval(service.validateResponse as any);
  return service;
}

async function _connect(token: string, encoding: romi.Encoding): Promise<romi.SossTransport> {
  return romi.SossTransport.connect('romi-js-test', 'wss://localhost:50001', token, encoding);
}

export class BrowserController {
  constructor(public driver: WebDriver, public token: string, public encoding: romi.Encoding) {}

  async publish(driver: WebDriver, topic: RomiTopic<StdmsgString>): Promise<void> {
    return driver.executeAsyncScript(
      async (
        token: string,
        encoding: romi.Encoding,
        topic: RomiTopic<StdmsgString>,
        done: () => void,
      ) => {
        const transport = await _connect(token, encoding);
        topic = _evalTopic(topic);
        const publisher = transport.createPublisher(topic);
        publisher.publish({ data: 'test' });
        transport.destroy();
        done();
      },
      this.token,
      this.encoding,
      topic,
    );
  }

  async subscribe(topic: RomiTopic<StdmsgString>): Promise<any> {
    return this.driver.executeAsyncScript(
      async (
        token: string,
        encoding: romi.Encoding,
        topic: RomiTopic<StdmsgString>,
        done: (msg: any) => void,
      ) => {
        const transport = await _connect(token, encoding);
        topic = _evalTopic(topic);
        transport.subscribe(topic, (msg: any) => {
          transport.destroy();
          done(msg);
        });
      },
      this.token,
      this.encoding,
      topic,
    );
  }

  async callService(
    driver: WebDriver,
    service: RomiService<SetBoolRequest, SetBoolResponse>,
  ): Promise<any> {
    return driver.executeAsyncScript(
      async (
        token: string,
        encoding: romi.Encoding,
        service: RomiService<SetBoolRequest, SetBoolResponse>,
        done: (msg: unknown) => void,
      ) => {
        const transport = await _connect(token, encoding);
        service = _evalService(service);
        const resp = await transport.call(service, { data: true });
        done(resp);
      },
      this.token,
      this.encoding,
      service,
    );
  }

  async startService(
    driver: WebDriver,
    service: RomiService<SetBoolRequest, SetBoolResponse>,
  ): Promise<any> {
    return driver.executeAsyncScript(
      async (
        token: string,
        encoding: romi.Encoding,
        service: RomiService<SetBoolRequest, SetBoolResponse>,
        done: () => void,
      ) => {
        const transport = await _connect(token, encoding);
        service = _evalService(service);
        const srv = transport.createService(service);
        srv.start(() => {
          srv.stop();
          return {
            message: 'ok',
            success: true,
          };
        });
        done();
      },
      this.token,
      this.encoding,
      service,
    );
  }

  async prepareBrowser(): Promise<void> {
    await this._injectScripts(this.driver, _connect, _evalTopic, _evalService);
  }

  private async _injectScripts(
    driver: WebDriver,
    ...scripts: ((...args: any[]) => any)[]
  ): Promise<void> {
    return driver.executeScript((scripts: string[]) => {
      scripts.forEach((x) => window.eval(x));
    }, scripts);
  }
}
