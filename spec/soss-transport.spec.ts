import * as ChildProcess from 'child_process';
import 'chromedriver';
import * as jwt from 'jsonwebtoken';
import * as rclnodejs from 'rclnodejs';
import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import { Encoding } from '../lib';
import { BrowserController } from './support/browser-controller';
import { testPublish, testService, testSubscribe } from './support/test-interfaces';

let node: rclnodejs.Node;
let sossProc: ChildProcess.ChildProcess;
let driver: WebDriver;
let token: string;
let browserController: BrowserController;

const testParams = {
  json: {
    sossConfigFile: `${__dirname}/support/soss.yaml`,
    encoding: Encoding.Json,
  },
  bson: {
    sossConfigFile: `${__dirname}/support/soss-bson.yaml`,
    encoding: Encoding.Bson,
  },
};

Object.values(testParams).forEach((param) => {
  describe('soss-transport', () => {
    beforeAll(async () => {
      await rclnodejs.init();

      // start soss
      sossProc = ChildProcess.spawn('soss', [param.sossConfigFile], {
        stdio: 'inherit',
      });
      process.on('exit', async () => {
        if (sossProc && !sossProc.killed) {
          sossProc.kill();
          await new Promise((res) => sossProc.once('exit', res));
        }
      });

      const payload = {
        user: 'romi-js-test',
      };
      token = jwt.sign(payload, 'rmf', { algorithm: 'HS256' });

      const chromeOptions = new Options().headless().addArguments('--ignore-certificate-errors');
      driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
      await driver.get(`file://${__dirname}/index.html`);
      browserController = new BrowserController(driver, token, param.encoding);
      await browserController.prepareBrowser();
    });

    afterAll(async () => {
      rclnodejs.shutdown();
      await driver.quit();
      sossProc.kill();
      await new Promise((res) => sossProc.once('exit', res));
    }, 2 ** 31 - 1);

    beforeEach(() => {
      node = rclnodejs.createNode('test_node');
      rclnodejs.spin(node);
    });

    afterEach(() => {
      node.destroy();
    });

    it('can publish', async (done) => {
      node.createSubscription('std_msgs/msg/String', 'test_publish', {}, async (msg) => {
        const s = msg as rclnodejs.std_msgs.msg.String;
        expect(s.data).toBe('test');
        done();
      });

      try {
        await browserController.publish(driver, testPublish);
      } catch (e) {
        const logs = await driver.manage().logs().get('browser');
        logs.forEach((entry) => console.error(entry.message));
      }
    });

    it('can subscribe', async () => {
      const interval = setInterval(() => {
        const publisher = node.createPublisher('std_msgs/msg/String', 'test_subscribe');
        publisher.publish('test');
      }, 100);
      const msg = await browserController.subscribe(testSubscribe);
      clearInterval(interval);
      expect(msg.data).toBe('test');
    });

    it('can call service', async () => {
      node.createService('std_srvs/srv/SetBool', 'test_service', {}, async (_, resp) => {
        resp.send({ success: true, message: 'success' });
      });
      const resp = await browserController.callService(driver, testService);
      expect(resp.success).toBeTruthy();
      expect(resp.message).toBe('success');
    });

    // not supported atm
    // it('can host service', async () => {
    //   await browserController.startService(driver, testService);
    //   const client = node.createClient('std_srvs/srv/SetBool', 'test_service');
    //   const msg = await new Promise<SetBoolResponse>(res =>
    //     client.sendRequest({ data: true }, msg => res(msg as SetBoolResponse)),
    //   );
    //   expect(msg.message).toBe('ok');
    //   expect(msg.success).toBe(true);
    // });
  });
});
