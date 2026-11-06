import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { PALETTE } from './palette.ts';

/** Small builder for things no free model covers, styled to sit next to the Polyfork low-poly set. */

const mat = (color: string) => new MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0 });

function teepee(radius: number, height: number, band: string): Group {
  const g = new Group();
  const hide = new Mesh(new ConeGeometry(radius, height, 9, 1, true), mat(PALETTE.hide));
  hide.position.y = height / 2;
  hide.material.side = 2;
  g.add(hide);
  // A painted band a third of the way up.
  const bandH = height * 0.12;
  const at = height * 0.3;
  const rLow = radius * (1 - at / height) + 0.02;
  const rHigh = radius * (1 - (at + bandH) / height) + 0.02;
  const stripe = new Mesh(new CylinderGeometry(rHigh, rLow, bandH, 9, 1, true), mat(band));
  stripe.position.y = at + bandH / 2;
  g.add(stripe);
  // Door flap.
  const door = new Mesh(new ConeGeometry(radius * 0.32, height * 0.38, 3), mat(PALETTE.hideDark));
  door.position.set(0, height * 0.19, radius * 0.78);
  door.rotation.x = -0.32;
  g.add(door);
  // Poles poking out of the top.
  const poleMat = mat(PALETTE.pole);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pole = new Mesh(new CylinderGeometry(0.05, 0.07, height * 0.45, 5), poleMat);
    pole.position.set(Math.cos(a) * 0.18, height * 0.98, Math.sin(a) * 0.18);
    pole.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(pole);
  }
  g.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export const PROCEDURAL: Record<string, () => Object3D> = {
  teepee: () => teepee(2.6, 5.2, PALETTE.hideBand),
  'teepee-lab': () => teepee(3.4, 7.6, PALETTE.labBand),
};
