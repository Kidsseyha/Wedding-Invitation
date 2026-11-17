import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngagementParticles } from './engagementAnimation';

test('buildEngagementParticles returns balanced deterministic particles within valid bounds', () => {
  const first = buildEngagementParticles(16);
  const second = buildEngagementParticles(16);

  assert.equal(first.length, 16);
  assert.deepEqual(first, second);

  const kinds = new Set(first.map((p) => p.kind));
  assert.ok(kinds.has('ring'));
  assert.ok(kinds.has('petal-rose'));
  assert.ok(kinds.has('petal-jasmine'));
  assert.ok(kinds.has('bokeh'));

  for (const p of first) {
    assert.ok(p.leftPct >= 0 && p.leftPct <= 100);
    assert.ok(p.durationSec >= 9);
    assert.ok(p.peakOpacity > 0 && p.peakOpacity <= 0.95);
    // Keep center typography corridor (30%..70%) unobstructed
    assert.ok(p.leftPct < 30 || p.leftPct >= 70, `Expected perimeter/ambient lane, got ${p.leftPct}`);
  }
});

test('engagement rings are limited to 3 upright hero pieces and petals descend', () => {
  const particles = buildEngagementParticles(16);
  const rings = particles.filter((p) => p.kind === 'ring');
  const petals = particles.filter((p) => p.kind === 'petal-rose' || p.kind === 'petal-jasmine');
  const bokeh = particles.filter((p) => p.kind === 'bokeh');

  assert.equal(rings.length, 3);
  assert.ok(petals.length >= 4);
  assert.ok(bokeh.length >= 4);

  for (const ring of rings) {
    assert.equal(ring.direction, 'ascend');
    assert.ok(ring.sizePx >= 44);
    assert.ok(ring.fromTopPct > ring.toTopPct);
    assert.ok(Math.abs(ring.tiltFromDeg) <= 10 && Math.abs(ring.tiltToDeg) <= 10);
  }

  for (const petal of petals) {
    assert.equal(petal.direction, 'descend');
    assert.ok(petal.fromTopPct < petal.toTopPct);
  }
});
