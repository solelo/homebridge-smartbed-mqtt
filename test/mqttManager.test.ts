import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeFakeLogger } from './mocks/hap';

class FakeMqttClient extends EventEmitter {
  subscribe = jest.fn((_topic: string, _opts: unknown, cb: (err?: Error) => void) => cb());
  publish = jest.fn((_topic: string, _payload: string, _opts: unknown, cb: (err?: Error) => void) => cb());
  end = jest.fn((_force: boolean, _opts: unknown, cb: () => void) => cb());
}

let lastClient: FakeMqttClient;
let lastConnectOptions: Record<string, unknown>;
const connectMock = jest.fn((options: Record<string, unknown>) => {
  lastConnectOptions = options;
  lastClient = new FakeMqttClient();
  return lastClient;
});

jest.mock('mqtt', () => ({
  connect: (options: Record<string, unknown>) => connectMock(options),
}));

// Must import after the mock is registered.
import { MqttManager } from '../src/mqtt/mqttManager';
import { MAX_PAYLOAD_BYTES } from '../src/settings';

describe('MqttManager', () => {
  beforeEach(() => {
    connectMock.mockClear();
  });

  it('defaults to mqtt:// on port 1883 when TLS is not requested', () => {
    const mgr = new MqttManager({ host: 'broker.local' }, makeFakeLogger() as any);
    mgr.connect();
    expect(lastConnectOptions.protocol).toBe('mqtt');
    expect(lastConnectOptions.port).toBe(1883);
    expect(lastConnectOptions.rejectUnauthorized).toBe(true);
  });

  it('defaults to mqtts:// on port 8883 when useTls is set', () => {
    const mgr = new MqttManager({ host: 'broker.local', useTls: true }, makeFakeLogger() as any);
    mgr.connect();
    expect(lastConnectOptions.protocol).toBe('mqtts');
    expect(lastConnectOptions.port).toBe(8883);
  });

  it('honors an explicit port over the protocol default', () => {
    const mgr = new MqttManager({ host: 'broker.local', useTls: true, port: 8884 }, makeFakeLogger() as any);
    mgr.connect();
    expect(lastConnectOptions.port).toBe(8884);
  });

  it('rejects unauthorized (validates certs) by default, even with TLS on', () => {
    const mgr = new MqttManager({ host: 'broker.local', useTls: true }, makeFakeLogger() as any);
    mgr.connect();
    expect(lastConnectOptions.rejectUnauthorized).toBe(true);
  });

  it('only disables certificate validation when allowInsecureTls is explicitly true, and logs a warning', () => {
    const log = makeFakeLogger();
    const mgr = new MqttManager({ host: 'broker.local', useTls: true, allowInsecureTls: true }, log as any);
    mgr.connect();
    expect(lastConnectOptions.rejectUnauthorized).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('insecure'));
  });

  it('loads CA/cert/key files from disk when useTls is set and paths are provided', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartbed-mqtt-test-'));
    const caFile = path.join(dir, 'ca.pem');
    const certFile = path.join(dir, 'cert.pem');
    const keyFile = path.join(dir, 'key.pem');
    fs.writeFileSync(caFile, 'CA-CONTENT');
    fs.writeFileSync(certFile, 'CERT-CONTENT');
    fs.writeFileSync(keyFile, 'KEY-CONTENT');

    const mgr = new MqttManager({ host: 'broker.local', useTls: true, caFile, certFile, keyFile }, makeFakeLogger() as any);
    mgr.connect();

    expect((lastConnectOptions.ca as Buffer).toString()).toBe('CA-CONTENT');
    expect((lastConnectOptions.cert as Buffer).toString()).toBe('CERT-CONTENT');
    expect((lastConnectOptions.key as Buffer).toString()).toBe('KEY-CONTENT');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('logs an error (but still connects) if a TLS cert file cannot be read', () => {
    const log = makeFakeLogger();
    const mgr = new MqttManager(
      { host: 'broker.local', useTls: true, caFile: '/nonexistent/path/ca.pem' },
      log as any,
    );
    expect(() => mgr.connect()).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read TLS certificate'));
    expect(connectMock).toHaveBeenCalled();
  });

  it('never sends empty-string username/password (mqtt.js would reject them)', () => {
    const mgr = new MqttManager({ host: 'broker.local', username: '', password: '' }, makeFakeLogger() as any);
    mgr.connect();
    expect(lastConnectOptions.username).toBeUndefined();
    expect(lastConnectOptions.password).toBeUndefined();
  });

  it('drops oversized payloads before they reach any handler', () => {
    const mgr = new MqttManager({ host: 'broker.local' }, makeFakeLogger() as any);
    const handler = jest.fn();
    mgr.onMessage(handler);
    mgr.connect();

    const oversized = Buffer.alloc(MAX_PAYLOAD_BYTES + 1, 'a');
    lastClient.emit('message', 'some/topic', oversized);
    expect(handler).not.toHaveBeenCalled();

    const ok = Buffer.alloc(MAX_PAYLOAD_BYTES, 'a');
    lastClient.emit('message', 'some/topic', ok);
    expect(handler).toHaveBeenCalledWith('some/topic', ok);
  });

  it('isolates a throwing handler so other handlers still run', () => {
    const log = makeFakeLogger();
    const mgr = new MqttManager({ host: 'broker.local' }, log as any);
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    mgr.onMessage(bad);
    mgr.onMessage(good);
    mgr.connect();

    lastClient.emit('message', 't', Buffer.from('x'));
    expect(good).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('restores every subscribed topic after a reconnect (clean session drops broker-side state)', () => {
    const mgr = new MqttManager({ host: 'broker.local' }, makeFakeLogger() as any);
    mgr.connect();
    mgr.subscribe('topic/a');
    mgr.subscribe('topic/b');
    lastClient.subscribe.mockClear();

    lastClient.emit('connect');
    const subscribedTopics = lastClient.subscribe.mock.calls.map((c) => c[0]);
    expect(subscribedTopics).toEqual(expect.arrayContaining(['topic/a', 'topic/b']));
  });

  it('reports isConnected() correctly across connect/close/offline transitions', () => {
    const mgr = new MqttManager({ host: 'broker.local' }, makeFakeLogger() as any);
    mgr.connect();
    expect(mgr.isConnected()).toBe(false);
    lastClient.emit('connect');
    expect(mgr.isConnected()).toBe(true);
    lastClient.emit('close');
    expect(mgr.isConnected()).toBe(false);
    lastClient.emit('connect');
    lastClient.emit('offline');
    expect(mgr.isConnected()).toBe(false);
  });

  it('never crashes the process on a client-level error event', () => {
    const log = makeFakeLogger();
    const mgr = new MqttManager({ host: 'broker.local' }, log as any);
    mgr.connect();
    expect(() => lastClient.emit('error', new Error('ECONNRESET'))).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ECONNRESET'));
  });

  it('refuses to publish while disconnected instead of throwing', () => {
    const log = makeFakeLogger();
    const mgr = new MqttManager({ host: 'broker.local' }, log as any);
    mgr.connect();
    mgr.publish('t', 'payload');
    expect(lastClient.publish).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not connected'));
  });

  it('throws a clear error if subscribe() is called before connect()', () => {
    const mgr = new MqttManager({ host: 'broker.local' }, makeFakeLogger() as any);
    expect(() => mgr.subscribe('t')).toThrow(/connect\(\) must be called/);
  });
});
