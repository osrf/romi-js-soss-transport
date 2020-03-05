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

  beforeEach(async () => {
    transport = await romi.SossTransport.connect('romi-js-test', 'wss://localhost:50001', token);
  });

  afterEach(async () => {
    await transport.destroy();
  });

  it('can publish', () => {
    const publisher = transport.createPublisher({
      validate: msg => msg,
      type: 'std_msgs/msg/String',
      topic: 'test_publish',
    });
    publisher.publish({ data: 'test' });
  });

  it('can subscribe', done => {
    transport.subscribe(
      {
        validate: msg => msg,
        type: 'std_msgs/msg/String',
        topic: 'test_subscribe',
      },
      msg => {
        expect(msg.data).toBe('test');
        done();
      },
    );
  });

  it('can call service', async () => {
    const resp = await transport.call(
      {
        validateResponse: msg => msg,
        type: 'std_srvs/srv/SetBool',
        service: 'test_service',
      },
      { data: true },
    );
    // bug in soss? returns 1 for true and 0 for false
    expect(resp.success).toBeTruthy(true);
    expect(resp.message).toBe('success');
  });
});
