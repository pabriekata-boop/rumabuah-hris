'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Karyawan {
  id: string;
  nama?: string;
  nama_lengkap?: string;
  cabang?: string;
  lokasi_toko?: string;
}

interface AbsensiHariIni {
  id: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  status_kehadiran: string;
}

export default function AbsensiKaryawan() {
  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [absenHariIni, setAbsenHariIni] = useState<AbsensiHariIni | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pesan, setPesan] = useState('');

  // Ambil tanggal hari ini (format YYYY-MM-DD sesuai waktu lokal WIB)
  const getTanggalHariIni = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

  // 1. Ambil daftar karyawan saat halaman dibuka
  useEffect(() => {
    const fetchKaryawan = async () => {
      const { data, error } = await supabase
        .from('karyawan')
        .select('*');

      if (error) {
        setPesan('❌ Gagal memuat daftar karyawan: ' + error.message);
      } else if (data) {
        setDaftarKaryawan(data);
      }
    };
    fetchKaryawan();
  }, []);

  // 2. Cek status absen hari ini setiap kali nama karyawan dipilih
  useEffect(() => {
    if (!selectedId) {
      setAbsenHariIni(null);
      return;
    }

    const cekAbsenHariIni = async () => {
      setChecking(true);
      setPesan('');
      const hariIni = getTanggalHariIni();

      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('karyawan_id', selectedId)
        .eq('tanggal', hariIni)
        .maybeSingle();

      if (error) {
        setPesan('❌ Gagal cek absensi: ' + error.message);
      } else {
        setAbsenHariIni(data);
      }
      setChecking(false);
    };

    cekAbsenHariIni();
  }, [selectedId]);

  // 3. Proses Absen Masuk
  const handleAbsenMasuk = async () => {
    if (!selectedId) return;
    setLoading(true);
    setPesan('');

    const hariIni = getTanggalHariIni();
    const waktuSekarang = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('absensi')
        .insert([
          {
            karyawan_id: selectedId,
            tanggal: hariIni,
            jam_masuk: waktuSekarang,
            status_kehadiran: 'Hadir',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setAbsenHariIni(data);
      setPesan('✅ Absen masuk berhasil dicatat!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal absen masuk: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  // 4. Proses Absen Pulang
  const handleAbsenPulang = async () => {
    if (!absenHariIni) return;
    setLoading(true);
    setPesan('');

    const waktuSekarang = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('absensi')
        .update({ jam_pulang: waktuSekarang })
        .eq('id', absenHariIni.id)
        .select()
        .single();

      if (error) throw error;
      setAbsenHariIni(data);
      setPesan('✅ Absen pulang berhasil dicatat! Hati-hati di jalan.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal absen pulang: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  // Format jam agar rapi (misal 08:15 WIB)
  const formatJam = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-600">
        <h1 className="text-2xl font-bold text-green-800 mb-1">Ruma Buah HRIS</h1>
        <p className="text-sm text-gray-500 mb-6">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>

        {/* Dropdown Pilih Karyawan */}
        <div className="text-left mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Pilih Nama Karyawan
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">-- Pilih Nama Anda --</option>
            {daftarKaryawan.map((k) => {
              const namaTampil = k.nama || k.nama_lengkap || 'Tanpa Nama';
              const cabangTampil = k.cabang || k.lokasi_toko;
              return (
                <option key={k.id} value={k.id}>
                  {namaTampil} {cabangTampil ? `(${cabangTampil})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Status & Tombol Absen */}
        {checking ? (
          <p className="text-sm text-gray-500 py-4">Mengecek data absen...</p>
        ) : !selectedId ? (
          <p className="text-sm text-gray-400 py-4">
            Silakan pilih nama terlebih dahulu untuk absen.
          </p>
        ) : !absenHariIni ? (
          <button
            onClick={handleAbsenMasuk}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Mencatat...' : 'Absen Masuk Sekarang'}
          </button>
        ) : !absenHariIni.jam_pulang ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
              Sudah absen masuk pukul <strong>{formatJam(absenHariIni.jam_masuk)}</strong>
            </div>
            <button
              onClick={handleAbsenPulang}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl transition duration-200 disabled:opacity-50"
            >
              {loading ? 'Mencatat...' : 'Absen Pulang Sekarang'}
            </button>
          </div>
        ) : (
          <div className="bg-green-100 border border-green-300 rounded-xl p-4 text-sm text-green-900 space-y-1">
            <p className="font-bold text-base">✅ Shift Hari Ini Selesai</p>
            <p>Masuk: <strong>{formatJam(absenHariIni.jam_masuk)}</strong></p>
            <p>Pulang: <strong>{formatJam(absenHariIni.jam_pulang)}</strong></p>
          </div>
        )}

        {pesan && (
          <p className="mt-4 text-sm font-medium text-gray-700">{pesan}</p>
        )}
      </div>
    </div>
  );
}