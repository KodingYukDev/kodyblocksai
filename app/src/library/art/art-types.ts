/** Spesifikasi aset sebelum di-hash (dipakai generator katalog). */

export interface CostumeArt {
  name: string;
  svg: string;
  /** Pusat rotasi (satuan SVG). Default: tengah viewBox. */
  center?: [number, number];
}

export interface SpriteArt {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  tags: string[];
  costumes: CostumeArt[];
  /** Id suara pustaka yang ikut ditambahkan bersama sprite. */
  sounds: string[];
}

export interface BackdropArt {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  tags: string[];
  svg: string;
}

export interface SoundArt {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  tags: string[];
  rate: number;
  samples: Float32Array;
}
