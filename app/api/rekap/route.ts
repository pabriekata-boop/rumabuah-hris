import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!process.env.HRIS_API_KEY || apiKey !== process.env.HRIS_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized: API Key tidak valid' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'gaji';

  try {
    // 1. Rekap Total Gaji per Bulan (untuk Laba-Rugi ERP)
    if (type === 'gaji') {
      const bulan = searchParams.get('bulan'); // Format: YYYY-MM
      if (!bulan) {
        return NextResponse.json({ error: 'Parameter bulan (YYYY-MM) wajib diisi' }, { status: 400 });
      }

      const { data: gaji, error } = await supabase
        .from('penggajian')
        .select('*, karyawan(nama, cabang)')
        .eq('bulan', bulan);

      if (error) throw error;

      const totalSemua = (gaji || []).reduce((acc, r) => acc + Number(r.total_gaji || 0), 0);
      const totalAntapani = (gaji || [])
        .filter((r) => (r.karyawan?.cabang || '').toLowerCase().includes('antapani'))
        .reduce((acc, r) => acc + Number(r.total_gaji || 0), 0);
      const totalJatinangor = (gaji || [])
        .filter((r) => (r.karyawan?.cabang || '').toLowerCase().includes('jatinangor'))
        .reduce((acc, r) => acc + Number(r.total_gaji || 0), 0);

      return NextResponse.json({
        bulan,
        jumlah_karyawan: gaji?.length || 0,
        total_semua: totalSemua,
        total_antapani: totalAntapani,
        total_jatinangor: totalJatinangor,
        detail: gaji,
      });
    }

    // 2. Rekap Absensi Harian (untuk pantauan cepat via Bot)
    if (type === 'absensi') {
      const tanggal =
        searchParams.get('tanggal') || new Date().toISOString().split('T')[0];

      const { data: absensi, error } = await supabase
        .from('absensi')
        .select('*, karyawan(nama, cabang)')
        .eq('tanggal', tanggal);

      if (error) throw error;

      return NextResponse.json({
        tanggal,
        total_hadir: absensi?.length || 0,
        data: absensi,
      });
    }

    // 3. Cek Pengajuan Pending (Lembur, Kasbon, Izin)
    if (type === 'pending') {
      const [lembur, kasbon, izin] = await Promise.all([
        supabase.from('lembur').select('*, karyawan(nama, cabang)').eq('status', 'Pending'),
        supabase.from('kasbon').select('*, karyawan(nama, cabang)').eq('status', 'Pending'),
        supabase.from('izin_sakit').select('*, karyawan(nama, cabang)').eq('status', 'Pending'),
      ]);

      return NextResponse.json({
        lembur_pending: lembur.data || [],
        kasbon_pending: kasbon.data || [],
        izin_pending: izin.data || [],
      });
    }

    return NextResponse.json({ error: 'Tipe tidak dikenali (gunakan: gaji, absensi, pending)' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}