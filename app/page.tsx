'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AbsensiKaryawan() {
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState('');

  // Ganti dengan salah satu UUID dari tabel karyawan di Supabase Anda
  const KARYAWAN_ID = "masukkan-uuid-karyawan-disini";

  const handleAbsenMasuk = async () => {
    setLoading(true);
    setPesan('');

    try {
      const { error } = await supabase
        .from('absensi')
        .insert([
          { 
            karyawan_id: KARYAWAN_ID, 
            status_kehadiran: 'Hadir',
          }
        ]);

      if (error) throw error;
      setPesan('✅ Absen masuk berhasil dicatat!');
    } catch (error: any) {
      setPesan('❌ Gagal absen: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-600">
        <h1 className="text-2xl font-bold text-green-800 mb-2">Ruma Buah HRIS</h1>
        <p className="text-gray-600 mb-8">Silakan absen untuk shift hari ini</p>

        <button 
          onClick={handleAbsenMasuk}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition duration-200 disabled:opacity-50"
        >
          {loading ? 'Mencatat...' : 'Absen Masuk Sekarang'}
        </button>

        {pesan && (
          <p className="mt-4 font-medium text-gray-700">{pesan}</p>
        )}
      </div>
    </div>
  );
}