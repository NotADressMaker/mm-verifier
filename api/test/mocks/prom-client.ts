class Metric {
  constructor(_config?: Record<string, unknown>) {}
}

class Registry {
  setDefaultLabels(_labels: Record<string, string>) {}
}

function collectDefaultMetrics(_config?: Record<string, unknown>) {}

class Gauge<T extends string = string> extends Metric {
  labels(_label: T) {
    return { set: (_value: number) => {} };
  }
}

class Histogram<T extends string = string> extends Metric {
  labels(_label: T) {
    return { observe: (_value: number) => {} };
  }
}

class Counter<T extends string = string> extends Metric {
  labels(_label: T) {
    return { inc: (_value?: number) => {} };
  }
}

const client = {
  Registry,
  Gauge,
  Histogram,
  Counter,
  collectDefaultMetrics,
};

export default client;
export { Registry, Gauge, Histogram, Counter, collectDefaultMetrics };
