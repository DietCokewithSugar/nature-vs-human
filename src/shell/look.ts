import { loadSettings } from '../data/storage.ts';

/** Which map renderer this page uses: `?r=3d` / `?r=pixel` override the saved setting. */
const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('r') : null;
export const LOOK: 'pixel' | '3d' = param === '3d' || param === 'pixel' ? param : loadSettings().look;
