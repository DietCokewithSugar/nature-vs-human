import { Quaternion, Vector3, type Bone, type Object3D } from 'three';

/**
 * Procedural walk for the Polyfork character rigs, which ship in a T-pose without clips.
 * Everything is measured from the bind pose in world space (where the arms actually point,
 * which way the shoulders run), so the rig's bone-axis conventions and facing do not matter.
 */
interface Joint {
  bone: Bone;
  rest: Quaternion;
  /** Bring the limb from its rest direction down to the side: axis in the parent frame + angle. */
  drop?: { axis: Vector3; angle: number };
  /** Stride axis (the shoulder line) in the parent frame. */
  swing: Vector3;
}

function toParent(bone: Bone, worldAxis: Vector3): Vector3 {
  const q = bone.parent ? bone.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  return worldAxis.clone().applyQuaternion(q.invert()).normalize();
}

function wp(b: Bone | undefined): Vector3 {
  return b ? b.getWorldPosition(new Vector3()) : new Vector3();
}

export class HumanRig {
  private joints = new Map<string, Joint>();
  private phase = Math.random() * Math.PI * 2;

  constructor(root: Object3D) {
    root.updateMatrixWorld(true);
    const bones = new Map<string, Bone>();
    root.traverse((o) => {
      if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    });
    const shoulderLine = wp(bones.get('RightArm')).sub(wp(bones.get('LeftArm')));
    if (shoulderLine.lengthSq() < 1e-8) shoulderLine.set(1, 0, 0);
    shoulderLine.normalize();
    const down = new Vector3(0, -1, 0);

    const add = (name: string, child?: string, dropTo?: Vector3) => {
      const bone = bones.get(name);
      if (!bone) return;
      const joint: Joint = { bone, rest: bone.quaternion.clone(), swing: toParent(bone, shoulderLine) };
      const end = child ? bones.get(child) : undefined;
      if (end && dropTo) {
        const dir = wp(end).sub(wp(bone)).normalize();
        const axis = new Vector3().crossVectors(dir, dropTo);
        if (axis.lengthSq() > 1e-6) {
          joint.drop = { axis: toParent(bone, axis.normalize()), angle: dir.angleTo(dropTo) };
        }
      }
      this.joints.set(name, joint);
    };
    // Arms hang slightly away from the body.
    add('LeftArm', 'LeftForeArm', down.clone().addScaledVector(shoulderLine, -0.18).normalize());
    add('RightArm', 'RightForeArm', down.clone().addScaledVector(shoulderLine, 0.18).normalize());
    for (const n of ['LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine']) add(n);
  }

  /** Turns are around axes in the parent frame, applied in order: q = Rn … R1 · rest. */
  private set(name: string, ...turns: [Vector3 | undefined, number][]): void {
    const j = this.joints.get(name);
    if (!j) return;
    j.bone.quaternion.copy(j.rest);
    for (const [axis, angle] of turns) if (axis && angle) j.bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, angle));
  }

  /** speed: 0 idle … 1 walking. */
  update(dt: number, speed: number): void {
    this.phase += dt * (2 + speed * 5);
    const s = Math.sin(this.phase);
    const stride = 0.04 + speed * 0.45;
    for (const side of ['Left', 'Right'] as const) {
      const dir = side === 'Left' ? 1 : -1;
      const arm = this.joints.get(`${side}Arm`);
      this.set(`${side}Arm`, [arm?.drop?.axis, arm?.drop?.angle ?? 0], [arm?.swing, dir * s * stride * 0.8]);
      const fore = this.joints.get(`${side}ForeArm`);
      this.set(`${side}ForeArm`, [fore?.swing, 0.15 + speed * 0.25]);
      const leg = this.joints.get(`${side}UpLeg`);
      this.set(`${side}UpLeg`, [leg?.swing, -dir * s * stride]);
      const knee = this.joints.get(`${side}Leg`);
      this.set(`${side}Leg`, [knee?.swing, -Math.max(0, dir * s) * stride * 1.3]);
    }
    const spine = this.joints.get('Spine');
    this.set('Spine', [spine?.swing, -0.03 * speed]);
  }
}
