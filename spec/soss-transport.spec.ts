import * as ChildProcess from 'child_process';
import * as jwt from 'jsonwebtoken';
import * as rclnodejs from 'rclnodejs';
import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import * as romi from '../lib';

let node: rclnodejs.Node;
let sossProc: ChildProcess.ChildProcess;
let driver: WebDriver;
let token: string;

async function browserConnect(token: string): Promise<romi.SossTransport> {
  return await romi.SossTransport.connect('romi-js-test', 'wss://localhost:50001', token);
}

async function browserPublish(token: string): Promise<void> {
  return driver.executeScript(async (token: string) => {
    const transport: romi.SossTransport = await browserConnect(token);

    const publisher = transport.createPublisher({
      validate: msg => msg,
      type: 'std_msgs/msg/String',
      topic: 'test_publish',
    });
    publisher.publish({ data: 'test' });
    transport.destroy();
  }, token);
}

async function browserSubscribe(token: string): Promise<any> {
  return driver.executeAsyncScript(async (token: string, done: (msg: any) => void) => {
    const transport: romi.SossTransport = await browserConnect(token);

    transport.subscribe(
      {
        validate: msg => msg,
        type: 'std_msgs/msg/String',
        topic: 'test_subscribe',
      },
      msg => {
        transport.destroy();
        done(msg);
      },
    );
  }, token);
}

async function browserCallService(token: string): Promise<any> {
  return driver.executeAsyncScript(async (token: string, done: (msg: any) => void) => {
    const transport: romi.SossTransport = await browserConnect(token);
    const resp = await transport.call(
      {
        validateResponse: msg => msg,
        type: 'std_srvs/srv/SetBool',
        service: 'test_service',
      },
      { data: true },
    );
    transport.destroy();
    done(resp);
  }, token);
}

async function injectScripts(
  driver: WebDriver,
  ...scripts: ((...args: any[]) => any)[]
): Promise<void> {
  return driver.executeScript(async (scripts: string[]) => {
    scripts.forEach(x => window.eval(x));
  }, scripts);
}

beforeAll(async () => {
  await rclnodejs.init();

  // start soss
  sossProc = ChildProcess.spawn('soss', [`${__dirname}/support/soss.yaml`], { stdio: 'inherit' });

  const chromeOptions = new Options().headless().addArguments('--ignore-certificate-errors');
  driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();
  await driver.get(`file://${__dirname}/index.html`);
  await injectScripts(driver, browserConnect);

  const payload = {
    user: 'romi-js-test',
  };
  token = jwt.sign(payload, 'rmf', { algorithm: 'HS256' });
});

afterAll(async () => {
  await driver.quit();
  sossProc.kill();
  await new Promise(res => sossProc.once('exit', res));
}, 2 ** 31 - 1);

beforeEach(() => {
  node = rclnodejs.createNode('test_node');
  rclnodejs.spin(node);
});

afterEach(() => {
  node.destroy();
});

it('can publish', async done => {
  node.createSubscription('std_msgs/msg/String', 'test_publish', {}, async msg => {
    const s = msg as rclnodejs.std_msgs.msg.String;
    expect(s.data).toBe('test');
    done();
  });

  try {
    browserPublish(token);
  } catch (e) {
    const logs = await driver
      .manage()
      .logs()
      .get('browser');
    logs.forEach(entry => console.error(entry.message));
  }
});

it('can subscribe', async () => {
  setInterval(() => {
    const publisher = node.createPublisher('std_msgs/msg/String', 'test_subscribe');
    publisher.publish('test');
  }, 100);
  const msg = await browserSubscribe(token);
  expect(msg.data).toBe('test');
});

it('can call service', async () => {
  node.createService('std_srvs/srv/SetBool', 'test_service', {}, async (_, resp) => {
    resp.send({ success: true, message: 'success' });
  });
  const resp = await browserCallService(token);
  expect(resp.success).toBeTruthy();
  expect(resp.message).toBe('success');
});
