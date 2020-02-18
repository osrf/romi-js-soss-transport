import * as ChildProcess from 'child_process';
import * as karma from 'karma';
import * as path from 'path';
import * as rclnodejs from 'rclnodejs';

function runKarmaTest(testCase: string): Promise<number> {
  const cp = ChildProcess.spawn(
    'karma',
    [
      'run',
      '--',
      '--grep',
      testCase
    ],
  );
  return new Promise(res => {
    cp.once('exit', res);
  });
}

describe('soss transport test', () => {
  let node: rclnodejs.Node;
  let karmaServer: karma.Server;
  let sossProc: ChildProcess.ChildProcess;
  let waitSossExit: Promise<void>;

  beforeAll(async () => {
    await rclnodejs.init();

    const karmaConfig = {
      configFile: path.resolve('./karma.conf.js'),
    };

    // start karma
    karmaServer = new karma.Server(karmaConfig);
    karmaServer.start();
    await new Promise(res => karmaServer.once('browsers_ready', res));

    // start soss
    sossProc = ChildProcess.spawn(
      'soss',
      [`${__dirname}/support/soss.yaml`],
      {
        stdio: ['pipe', 'pipe', 'inherit'],
      },
    );
    sossProc.on('error', e => console.error(e.message));
    waitSossExit = new Promise(res => {
      sossProc.once('exit', res);
    });
  });

  beforeEach(async () => {
    node = rclnodejs.createNode('test_node');
    rclnodejs.spin(node);
  });

  afterEach(async () => {
    node.destroy();
  });

  afterAll(async () => {
    (karmaServer as any).stop();
    sossProc.kill();
    await waitSossExit;
  });

  it('can publish', async done => {
    const p = runKarmaTest('can publish');
    node.createSubscription('std_msgs/msg/String', 'test_publish', {}, async msg => {
      const s = msg as rclnodejs.std_msgs.msg.String;
      expect(s.data).toBe('test');
      const clientResult = await p;
      expect(clientResult).toBe(0);
      done();
    });
  });

  it('can subscribe', async () => {
    setInterval(() => {
      const publisher = node.createPublisher('std_msgs/msg/String', 'test_subscribe');
      publisher.publish('test');
    }, 100);
    const clientResult = await runKarmaTest('can subscribe');
    expect(clientResult).toBe(0);
  });

  it('can call service', async done => {
    const p = runKarmaTest('can call service');
    node.createService('std_srvs/srv/Empty', 'test_service', {}, async (_, resp) => {
      resp.send({});
      const clientResult = await p;
      expect(clientResult).toBe(0);
      done();
    });
  });
});
