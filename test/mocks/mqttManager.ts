/**
 * In-memory stand-in for MqttManager's public surface, so discovery/accessory/handler
 * tests can simulate broker traffic without a real network connection.
 */
export class FakeMqttManager {
  private readonly handlers: Array<(topic: string, payload: Buffer) => void> = [];
  readonly subscribedTopics = new Set<string>();
  readonly published: Array<{ topic: string; payload: string; retain: boolean }> = [];
  private connected = true;

  onMessage(handler: (topic: string, payload: Buffer) => void): void {
    this.handlers.push(handler);
  }

  subscribe(topic: string): void {
    this.subscribedTopics.add(topic);
  }

  publish(topic: string, payload: string, retain = false): void {
    if (!this.connected) {
      return;
    }
    this.published.push({ topic, payload, retain });
  }

  isConnected(): boolean {
    return this.connected;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  connect(): void {
    this.connected = true;
  }

  async destroy(): Promise<void> {
    this.connected = false;
  }

  /** Test helper: deliver an incoming MQTT message to every registered handler. */
  emitMessage(topic: string, payload: string | Buffer): void {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    for (const handler of this.handlers) {
      handler(topic, buf);
    }
  }
}
