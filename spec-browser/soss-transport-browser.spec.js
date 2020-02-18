describe('soss transport test', () => {
  let transport;
  let token;

  beforeAll(() => {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const payload = {
      user: 'romi-js-test',
    };
    token = KJUR.jws.JWS.sign('HS256', header, payload, 'rmf');
  });

  beforeEach(() => {
    transport = new romi.SossTransport('romi-js-test', 'wss://localhost:50001', token);
  });

  afterEach(async () => {
    await transport.destroy();
  });

  it('can publish', () => {
    const publisher = transport.createPublisher({
      type: 'std_msgs/msg/String',
      topic: 'test_publish',
    });
    publisher.publish({data: 'test'});
  });

  it('can subscribe', done => {
    transport.subscribe({
      type: 'std_msgs/msg/String',
      topic: 'test_subscribe',
    }, msg => {
      expect(msg.data).toBe('test');
      done();
    });
  });

  it('can call service', async () => {
    const resp = await transport.call({
      type: 'std_srvs/srv/Empty',
      service: 'test_service',
    }, {});
    expect(resp.result).toBeTruthy();
  });
});
