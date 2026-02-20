
export type DurasiInput = {
  jam: number;
  menit: number;
  detik: number;
};

export type HasilPreviewPostAt = {
  teks: string;
  targetMs: number | null;
  dayOffset: number;
};

function nrmlssangk(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function htngdayoffst(now: Date, target: Date): number {
  const awalHariNow = new Date(now);
  awalHariNow.setHours(0, 0, 0, 0);

  const awalHariTarget = new Date(target);
  awalHariTarget.setHours(0, 0, 0, 0);

  return Math.round((awalHariTarget.getTime() - awalHariNow.getTime()) / 86_400_000);
}

function frmtjammnt(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function frmtprvwpstat(durasi: DurasiInput, now: Date = new Date()): HasilPreviewPostAt {
  const jam = nrmlssangk(durasi.jam);
  const menit = nrmlssangk(durasi.menit);
  const detik = nrmlssangk(durasi.detik);

  const totalMs = (jam * 60 * 60 + menit * 60 + detik) * 1000;
  if (totalMs <= 0) {
    return {
      teks: 'Set duration to see post time',
      targetMs: null,
      dayOffset: 0,
    };
  }

  const target = new Date(now.getTime() + totalMs);
  const dayOffset = htngdayoffst(now, target);
  const waktu = frmtjammnt(target);

  if (dayOffset <= 0) {
    return {
      teks: `Will post at ${waktu}`,
      targetMs: target.getTime(),
      dayOffset,
    };
  }

  if (dayOffset === 1) {
    return {
      teks: `Will post at ${waktu} tomorrow`,
      targetMs: target.getTime(),
      dayOffset,
    };
  }

  return {
    teks: `Will post at ${waktu} in ${dayOffset} days`,
    targetMs: target.getTime(),
    dayOffset,
  };
}
