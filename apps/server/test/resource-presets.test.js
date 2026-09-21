import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourcePresets } from '../../web/src/content/resourcePresets.js';
import { resourceSchema, resourceKinds } from '../src/domain.js';

test('resource presets are well-formed and within server limits', () => {
  assert.ok(resourcePresets.length >= 4);
  assert.equal(
    new Set(resourcePresets.map((p) => p.id)).size,
    resourcePresets.length,
    'preset ids must be unique',
  );
  for (const kind of resourceKinds)
    assert.ok(
      resourcePresets.some((p) => p.kind === kind),
      `expected at least one ${kind} preset`,
    );
  for (const preset of resourcePresets) {
    assert.match(preset.id, /^preset-[a-z0-9-]+$/);
    assert.ok(preset.label.length > 0 && preset.label.length <= 200, preset.id);
    const parsed = resourceSchema.parse({
      kind: preset.kind,
      title: preset.title,
      body: preset.body,
      position: 0,
      active: true,
    });
    assert.equal(parsed.title, preset.title);
    assert.equal(parsed.body, preset.body);
  }
});
