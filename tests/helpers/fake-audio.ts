import { vi } from "vitest";

export class FakeParam {
  value: number;
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  cancelScheduledValues = vi.fn(() => this);
}

export class FakeNode {
  connected: unknown[] = [];
  connect = vi.fn((target: unknown) => {
    this.connected.push(target);
    return target;
  });
  disconnect = vi.fn();
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

export class FakeOscillator extends FakeSource {
  type = "sine";
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}

export class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

export class FakeBuffer {
  private data: Float32Array;
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}

export class FakeConvolver extends FakeNode {
  buffer: unknown = null;
  normalize = true;
}

export class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  ratio = new FakeParam(12);
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  sampleRate = 8000;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  convolvers: FakeConvolver[] = [];
  compressors: FakeCompressor[] = [];
  buffers: FakeBuffer[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = "suspended";
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
  createOscillator = vi.fn(() => {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    this.nodes.push(node);
    return node;
  });
  createBufferSource = vi.fn(() => {
    const node = new FakeBufferSource();
    this.bufferSources.push(node);
    this.nodes.push(node);
    return node;
  });
  createGain = vi.fn(() => {
    const node = new FakeGain();
    this.gains.push(node);
    this.nodes.push(node);
    return node;
  });
  createBiquadFilter = vi.fn(() => {
    const node = new FakeFilter();
    this.filters.push(node);
    this.nodes.push(node);
    return node;
  });
  createConvolver = vi.fn(() => {
    const node = new FakeConvolver();
    this.convolvers.push(node);
    this.nodes.push(node);
    return node;
  });
  createDynamicsCompressor = vi.fn(() => {
    const node = new FakeCompressor();
    this.compressors.push(node);
    this.nodes.push(node);
    return node;
  });
  createBuffer = vi.fn((channels: number, length: number, rate: number) => {
    const buffer = new FakeBuffer(channels, length, rate);
    this.buffers.push(buffer);
    return buffer;
  });

  get sources(): FakeSource[] {
    return [...this.oscillators, ...this.bufferSources];
  }
}
