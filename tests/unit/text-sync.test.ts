import { beforeEach, describe, expect, it } from "vitest";
import { Group, Object3D } from "three";
import { floorOfObject, trackTextSync } from "@/experience/tower/textSync";
import { resetRidePrep, ridePrep } from "@/experience/tower/ridePrep";

/** Mimics troika's sync contract: one typeset at a time, `_needsSync` cleared on start. */
class FakeText extends Object3D {
  _needsSync = true;
  _isSyncing = false;
  private pending: (() => void)[] = [];
  sync(callback?: () => void) {
    if (!this._needsSync) return;
    this._needsSync = false;
    this._isSyncing = true;
    this.pending.push(() => {
      this._isSyncing = false;
      callback?.();
    });
  }
  finish() {
    this.pending.shift()?.();
  }
}

/** troika keeps BatchedText members out of the scene graph. */
class FakeBatch extends FakeText {
  addText(text: Object3D) {
    void text;
  }
}

trackTextSync(FakeText.prototype, FakeBatch.prototype);
trackTextSync(FakeText.prototype, FakeBatch.prototype);

function floorGroup(id: string) {
  const g = new Group();
  g.name = `floor-${id}`;
  const content = new Group();
  g.add(content);
  return { g, content };
}

beforeEach(resetRidePrep);

describe("troika sync tracking", () => {
  it("counts a typeset on the text's floor until it completes", () => {
    const { content } = floorGroup("L3");
    const text = new FakeText();
    content.add(text);
    text.sync();
    expect(ridePrep.texts.get("L3")).toBe(1);
    text.sync();
    expect(ridePrep.texts.get("L3")).toBe(1);
    text.finish();
    expect(ridePrep.texts.get("L3")).toBe(0);
  });

  it("ignores texts outside a floor (the shaft indicators) and texts with nothing to typeset", () => {
    const loose = new FakeText();
    loose.sync();
    expect(ridePrep.texts.size).toBe(0);
    const { content } = floorGroup("L1");
    const done = new FakeText();
    done._needsSync = false;
    content.add(done);
    done.sync();
    expect(ridePrep.texts.size).toBe(0);
  });

  it("attributes BatchedText members to the batch's floor", () => {
    const { content } = floorGroup("L2");
    const batch = new FakeBatch();
    batch._needsSync = false;
    content.add(batch);
    const member = new FakeText();
    batch.addText(member);
    expect(floorOfObject(member)).toBe("L2");
    member.sync();
    expect(ridePrep.texts.get("L2")).toBe(1);
    member.finish();
    expect(ridePrep.texts.get("L2")).toBe(0);
  });
});
