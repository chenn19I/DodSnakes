const DEFAULT_MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const BROADCAST_CHANNEL_NAME = 'dodsnake-relay-v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface RelayEnvelope<T = unknown> {
  v: 1;
  msgId: string;
  roomCode: string;
  senderId: string;
  targetId?: string;
  event: string;
  payload: T;
  ts: number;
}

export interface MqttParsedPacket {
  type: number;
  flags: number;
  topic?: string;
  packetId?: number;
  returnCode?: number;
  payload: Uint8Array;
}

function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = [];
  let x = length;
  do {
    let encoded = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (x > 0);
  return bytes;
}

function encodeUtf8String(str: string): Uint8Array {
  const utf8 = encoder.encode(str);
  const out = new Uint8Array(2 + utf8.length);
  out[0] = (utf8.length >> 8) & 0xff;
  out[1] = utf8.length & 0xff;
  out.set(utf8, 2);
  return out;
}

export function encodeMqttConnectPacket(clientId: string, keepAliveSec = 45): Uint8Array {
  const cleanId = clientId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 23) || 'dodsnake_client';
  const idBytes = encodeUtf8String(cleanId);
  const variableHeader = new Uint8Array([
    0x00,
    0x04,
    0x4d,
    0x51,
    0x54,
    0x54, // "MQTT"
    0x04, // MQTT 3.1.1
    0x02, // Clean session
    (keepAliveSec >> 8) & 0xff,
    keepAliveSec & 0xff,
  ]);
  const remLen = variableHeader.length + idBytes.length;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);
  packet[0] = 0x10;
  packet.set(remBytes, 1);
  packet.set(variableHeader, 1 + remBytes.length);
  packet.set(idBytes, 1 + remBytes.length + variableHeader.length);
  return packet;
}

export function encodeMqttSubscribePacket(packetId: number, topic: string): Uint8Array {
  const topicBytes = encodeUtf8String(topic);
  const remLen = 2 + topicBytes.length + 1;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);
  let pos = 0;
  packet[pos++] = 0x82; // SUBSCRIBE with required flag bits 0010
  for (const b of remBytes) packet[pos++] = b;
  packet[pos++] = (packetId >> 8) & 0xff;
  packet[pos++] = packetId & 0xff;
  packet.set(topicBytes, pos);
  pos += topicBytes.length;
  packet[pos] = 0x00; // QoS 0
  return packet;
}

export function encodeMqttPublishPacket(topic: string, payloadUtf8: Uint8Array): Uint8Array {
  const topicBytes = encodeUtf8String(topic);
  const remLen = topicBytes.length + payloadUtf8.length;
  const remBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remBytes.length + remLen);
  let pos = 0;
  packet[pos++] = 0x30; // PUBLISH QoS 0, retain 0
  for (const b of remBytes) packet[pos++] = b;
  packet.set(topicBytes, pos);
  pos += topicBytes.length;
  packet.set(payloadUtf8, pos);
  return packet;
}

export function encodeMqttPubackPacket(packetId: number): Uint8Array {
  return new Uint8Array([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]);
}

export function encodeMqttPingreqPacket(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

export function encodeMqttDisconnectPacket(): Uint8Array {
  return new Uint8Array([0xe0, 0x00]);
}

export class MqttPacketStreamParser {
  private buffer: Uint8Array = new Uint8Array(0);

  public push(chunk: Uint8Array): MqttParsedPacket[] {
    if (chunk.length === 0) return [];
    const combined = new Uint8Array(this.buffer.length + chunk.length);
    combined.set(this.buffer, 0);
    combined.set(chunk, this.buffer.length);
    this.buffer = combined;

    const packets: MqttParsedPacket[] = [];
    while (this.buffer.length >= 2) {
      let multiplier = 1;
      let remLen = 0;
      let headerBytes = 1;
      let completeVarInt = false;

      for (let i = 1; i < Math.min(this.buffer.length, 5); i++) {
        const encoded = this.buffer[i];
        remLen += (encoded & 0x7f) * multiplier;
        headerBytes++;
        if ((encoded & 0x80) === 0) {
          completeVarInt = true;
          break;
        }
        multiplier *= 128;
      }

      if (!completeVarInt) break;
      const totalLen = headerBytes + remLen;
      if (this.buffer.length < totalLen) break;

      const firstByte = this.buffer[0];
      const type = (firstByte >> 4) & 0x0f;
      const flags = firstByte & 0x0f;
      const body = this.buffer.slice(headerBytes, totalLen);
      this.buffer = this.buffer.slice(totalLen);

      if (type === 2 && body.length >= 2) {
        // CONNACK
        packets.push({ type, flags, returnCode: body[1], payload: body });
      } else if (type === 3 && body.length >= 2) {
        // PUBLISH
        const topicLen = (body[0] << 8) | body[1];
        const qos = (flags >> 1) & 0x03;
        let offset = 2 + topicLen;
        const topic = decoder.decode(body.slice(2, Math.min(offset, body.length)));
        let packetId: number | undefined;
        if (qos > 0 && offset + 2 <= body.length) {
          packetId = (body[offset] << 8) | body[offset + 1];
          offset += 2;
        }
        const payload = body.slice(offset);
        packets.push({ type, flags, topic, packetId, payload });
      } else if (type === 9 && body.length >= 2) {
        // SUBACK
        const packetId = (body[0] << 8) | body[1];
        const returnCode = body[2] ?? 0;
        packets.push({ type, flags, packetId, returnCode, payload: body });
      } else {
        packets.push({ type, flags, payload: body });
      }
    }

    return packets;
  }
}

export interface RoomRelayChannelOptions {
  roomCode: string;
  clientId: string;
  brokers?: string[];
  onEnvelope: (envelope: RelayEnvelope) => void;
  onMqttReady?: () => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'local_only' | 'closed') => void;
}

interface BrokerConnectionSlot {
  index: number;
  url: string;
  ws: WebSocket | null;
  parser: MqttPacketStreamParser;
  mqttReady: boolean;
  pingTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  handshakeTimer: ReturnType<typeof setTimeout> | null;
}

export class RoomRelayChannel {
  public readonly roomCode: string;
  public readonly clientId: string;
  private readonly topic: string;
  private readonly brokers: string[];
  private readonly onEnvelope: (envelope: RelayEnvelope) => void;
  private readonly onMqttReady?: () => void;
  private readonly onStatusChange?: (status: 'connecting' | 'connected' | 'local_only' | 'closed') => void;

  private bc: BroadcastChannel | null = null;
  private slots: BrokerConnectionSlot[] = [];
  private seenMsgIds: string[] = [];
  private seenSet = new Set<string>();
  private packetCounter = 1;
  private closed = false;

  constructor(options: RoomRelayChannelOptions) {
    this.roomCode = options.roomCode.toUpperCase();
    this.clientId = options.clientId;
    this.topic = `dodsnake/v1/room/${this.roomCode}`;
    this.brokers = options.brokers && options.brokers.length > 0 ? options.brokers : DEFAULT_MQTT_BROKERS;
    this.onEnvelope = options.onEnvelope;
    this.onMqttReady = options.onMqttReady;
    this.onStatusChange = options.onStatusChange;

    this.initBroadcastChannel();
    if (typeof WebSocket === 'undefined') {
      this.onStatusChange?.('local_only');
      return;
    }

    this.onStatusChange?.('connecting');
    this.slots = this.brokers.map((url, index) => ({
      index,
      url,
      ws: null,
      parser: new MqttPacketStreamParser(),
      mqttReady: false,
      pingTimer: null,
      reconnectTimer: null,
      handshakeTimer: null,
    }));
    for (const slot of this.slots) {
      this.connectBrokerSlot(slot);
    }
  }

  public isMqttConnected(): boolean {
    return this.slots.some((s) => s.mqttReady && s.ws?.readyState === WebSocket.OPEN);
  }

  public send<T>(event: string, payload: T, targetId?: string): string {
    if (this.closed) return '';
    const msgId = `${this.clientId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
    const envelope: RelayEnvelope<T> = {
      v: 1,
      msgId,
      roomCode: this.roomCode,
      senderId: this.clientId,
      targetId,
      event,
      payload,
      ts: Date.now(),
    };
    this.rememberMsgId(msgId);

    if (this.bc) {
      try {
        this.bc.postMessage(envelope);
      } catch {
        // BroadcastChannel may be closed during teardown
      }
    }

    let encodedFrame: Uint8Array | null = null;
    for (const slot of this.slots) {
      if (slot.mqttReady && slot.ws && slot.ws.readyState === WebSocket.OPEN) {
        try {
          if (!encodedFrame) {
            encodedFrame = encodeMqttPublishPacket(this.topic, encoder.encode(JSON.stringify(envelope)));
          }
          slot.ws.send(encodedFrame);
        } catch {
          // Ignore transient write error; reconnect loop recovers
        }
      }
    }

    return msgId;
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const slot of this.slots) {
      slot.mqttReady = false;
      this.clearSlotTimers(slot);
      if (slot.ws) {
        try {
          if (slot.ws.readyState === WebSocket.OPEN) {
            slot.ws.send(encodeMqttDisconnectPacket());
          }
          slot.ws.close();
        } catch {
          // Ignore close error
        }
        slot.ws = null;
      }
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch {
        // Ignore
      }
      this.bc = null;
    }
    this.onStatusChange?.('closed');
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.bc.onmessage = (ev: MessageEvent) => {
        this.handleIncomingRaw(ev.data);
      };
    } catch {
      this.bc = null;
    }
  }

  private clearSlotTimers(slot: BrokerConnectionSlot): void {
    if (slot.pingTimer !== null) {
      clearInterval(slot.pingTimer);
      slot.pingTimer = null;
    }
    if (slot.reconnectTimer !== null) {
      clearTimeout(slot.reconnectTimer);
      slot.reconnectTimer = null;
    }
    if (slot.handshakeTimer !== null) {
      clearTimeout(slot.handshakeTimer);
      slot.handshakeTimer = null;
    }
  }

  private emitAggregatedStatus(): void {
    if (this.closed) return;
    if (this.isMqttConnected()) {
      this.onStatusChange?.('connected');
    } else {
      this.onStatusChange?.(this.bc ? 'local_only' : 'connecting');
    }
  }

  private connectBrokerSlot(slot: BrokerConnectionSlot): void {
    if (this.closed || typeof WebSocket === 'undefined') return;
    this.clearSlotTimers(slot);
    slot.mqttReady = false;
    slot.parser = new MqttPacketStreamParser();

    let ws: WebSocket;
    try {
      ws = new WebSocket(slot.url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      slot.ws = ws;
    } catch {
      this.scheduleSlotReconnect(slot);
      return;
    }

    slot.handshakeTimer = globalThis.setTimeout(() => {
      if (!slot.mqttReady && slot.ws === ws && !this.closed) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
        this.scheduleSlotReconnect(slot);
      }
    }, 8000);

    ws.onopen = () => {
      if (this.closed || slot.ws !== ws) return;
      const base = this.clientId.replace(/[^A-Za-z0-9]/g, '').slice(0, 15);
      const mqttId = `ds_${base}_${slot.index}`;
      ws.send(encodeMqttConnectPacket(mqttId, 45));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.closed || slot.ws !== ws) return;
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.processMqttChunk(slot, new Uint8Array(data), ws);
      } else if (data instanceof Blob) {
        void data.arrayBuffer().then((buf) => {
          if (!this.closed && slot.ws === ws) {
            this.processMqttChunk(slot, new Uint8Array(buf), ws);
          }
        });
      }
    };

    ws.onerror = () => {
      if (this.closed || slot.ws !== ws) return;
      this.emitAggregatedStatus();
    };

    ws.onclose = () => {
      if (this.closed || slot.ws !== ws) return;
      slot.mqttReady = false;
      this.clearSlotTimers(slot);
      this.scheduleSlotReconnect(slot);
    };
  }

  private scheduleSlotReconnect(slot: BrokerConnectionSlot): void {
    if (this.closed) return;
    slot.mqttReady = false;
    this.clearSlotTimers(slot);
    this.emitAggregatedStatus();
    slot.reconnectTimer = globalThis.setTimeout(() => {
      this.connectBrokerSlot(slot);
    }, 1500);
  }

  private processMqttChunk(slot: BrokerConnectionSlot, chunk: Uint8Array, ws: WebSocket): void {
    const packets = slot.parser.push(chunk);
    for (const pkt of packets) {
      if (pkt.type === 2) {
        // CONNACK
        if (pkt.returnCode === 0) {
          const pid = this.nextPacketId();
          ws.send(encodeMqttSubscribePacket(pid, this.topic));
        } else {
          this.scheduleSlotReconnect(slot);
          return;
        }
      } else if (pkt.type === 9) {
        // SUBACK
        if ((pkt.returnCode ?? 0) !== 0x80) {
          if (slot.handshakeTimer !== null) {
            clearTimeout(slot.handshakeTimer);
            slot.handshakeTimer = null;
          }
          slot.mqttReady = true;
          this.emitAggregatedStatus();
          if (slot.pingTimer === null) {
            slot.pingTimer = globalThis.setInterval(() => {
              if (slot.ws === ws && ws.readyState === WebSocket.OPEN) {
                ws.send(encodeMqttPingreqPacket());
              }
            }, 20_000);
          }
          this.onMqttReady?.();
        }
      } else if (pkt.type === 3) {
        // PUBLISH
        if (pkt.packetId !== undefined) {
          ws.send(encodeMqttPubackPacket(pkt.packetId));
        }
        try {
          const text = decoder.decode(pkt.payload);
          const parsed = JSON.parse(text);
          this.handleIncomingRaw(parsed);
        } catch {
          // Ignore malformed third-party frame on public topic
        }
      }
    }
  }

  private nextPacketId(): number {
    this.packetCounter = (this.packetCounter % 65_000) + 1;
    return this.packetCounter;
  }

  private rememberMsgId(msgId: string): boolean {
    if (this.seenSet.has(msgId)) return false;
    this.seenSet.add(msgId);
    this.seenMsgIds.push(msgId);
    if (this.seenMsgIds.length > 500) {
      const oldest = this.seenMsgIds.shift();
      if (oldest) this.seenSet.delete(oldest);
    }
    return true;
  }

  private handleIncomingRaw(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const env = raw as Partial<RelayEnvelope>;
    if (env.v !== 1 || typeof env.msgId !== 'string' || typeof env.event !== 'string') return;
    if ((env.roomCode ?? '').toUpperCase() !== this.roomCode) return;
    if (env.senderId === this.clientId) return;
    if (env.targetId && env.targetId !== '*' && env.targetId !== this.clientId) return;
    if (!this.rememberMsgId(env.msgId)) return;
    this.onEnvelope(env as RelayEnvelope);
  }
}
