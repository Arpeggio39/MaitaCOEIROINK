class EncoderBudget {
  constructor(limit = 1) { this.limit = limit; this.active = 0; this.waiters = []; }
  async acquire() {
    while (this.active >= this.limit) await new Promise(resolve => this.waiters.push(resolve));
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true; this.active--;
      this.waiters.splice(0).forEach(resolve => resolve());
    };
  }
  reduce() { this.limit = Math.max(1, Math.min(this.limit - 1, this.active - 1)); }
}
module.exports = { EncoderBudget };
