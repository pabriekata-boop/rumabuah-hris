'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Karyawan {
  id: string;
  nama?: string;
  nama_lengkap?: string;
  cabang?: string;
  lokasi_toko?: string;
  pin?: string;
}

interface AbsensiHariIni {
  id: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  foto_masuk?: string | null;
  foto_pulang?: string | null;
  status_kehadiran: string;
}

export default function AbsensiKaryawan() {
  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [absenHariIni, setAbsenHariIni] = useState<AbsensiHariIni | null>(null);
  const [tanggalTampil, setTanggalTampil] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pesan, setPesan] = useState('');

  const getTanggalHariIni = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

  useEffect(() => {
    setTanggalTampil(
      new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    );

    const fetchKaryawan = async () => {
      const { data, error } = await supabase.from('karyawan').select('*');
      if (error) {
        setPesan('❌ Gagal memuat daftar karyawan: ' + error.message);
      } else if (data) {
        setDaftarKaryawan(data);
      }
    };
    fetchKaryawan();
  }, []);

  useEffect(() => {
    setPinInput('');
    setFotoFile(null);
    setFotoPreview(null);
    setPesan('');

    if (!selectedId) {
      setAbsenHariIni(null);
      return;
    }

    const cekAbsenHariIni = async () => {
      setChecking(true);
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

  const handlePilihFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  const validasiSebelumAbsen = () => {
    const karyawan = daftarKaryawan.find((k) => k.id === selectedId);
    const pinBenar = karyawan?.pin || '1234';

    if (pinInput.trim() !== pinBenar) {
      setPesan('❌ PIN salah! Silakan cek kembali PIN Anda.');
      return false;
    }
    if (!fotoFile) {
      setPesan('❌ Wajib ambil foto selfie terlebih dahulu.');
      return false;
    }
    return true;
  };

  const uploadFoto = async (tipe: 'masuk' | 'pulang') => {
    if (!fotoFile) return null;
    const ext = fotoFile.name.split('.').pop() || 'jpg';
    const fileName = `${getTanggalHariIni()}/${selectedId}-${tipe}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('foto-absensi')
      .upload(fileName, fotoFile);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('foto-absensi').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleAbsenMasuk = async () => {
    if (!validasiSebelumAbsen()) return;
    setLoading(true);
    setPesan('');

    try {
      const fotoUrl = await uploadFoto('masuk');
      const { data, error } = await supabase
        .from('absensi')
        .insert([
          {
            karyawan_id: selectedId,
            tanggal: getTanggalHariIni(),
            jam_masuk: new Date().toISOString(),
            foto_masuk: fotoUrl,
            status_kehadiran: 'Hadir',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setAbsenHariIni(data);
      setPinInput('');
      setFotoFile(null);
      setFotoPreview(null);
      setPesan('✅ Absen masuk & foto berhasil dicatat!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal absen masuk: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAbsenPulang = async () => {
    if (!absenHariIni || !validasiSebelumAbsen()) return;
    setLoading(true);
    setPesan('');

    try {
      const fotoUrl = await uploadFoto('pulang');
      const { data, error } = await supabase
        .from('absensi')
        .update({
          jam_pulang: new Date().toISOString(),
          foto_pulang: fotoUrl,
        })
        .eq('id', absenHariIni.id)
        .select()
        .single();

      if (error) throw error;
      setAbsenHariIni(data);
      setPinInput('');
      setFotoFile(null);
      setFotoPreview(null);
      setPesan('✅ Absen pulang & foto berhasil dicatat! Hati-hati di jalan.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal absen pulang: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const formatJam = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const butuhAbsen = selectedId && (!absenHariIni || !absenHariIni.jam_pulang);

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-600">
        <h1 className="text-2xl font-bold text-green-800 mb-1">Ruma Buah HRIS</h1>
        <p className="text-sm text-gray-500 mb-6 min-h-[20px]">{tanggalTampil}</p>

        {/* Pilih Nama */}
        <div className="text-left mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Nama Karyawan
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

        {/* Input PIN & Foto Selfie (muncul jika belum selesai shift) */}
        {!checking && butuhAbsen && (
          <div className="space-y-4 mb-5 text-left">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Masukkan PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Masukkan PIN Anda"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Foto Selfie di Toko
              </label>
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handlePilihFoto}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-100 file:text-green-800 hover:file:bg-green-200"
              />
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Preview Selfie"
                  className="mt-3 w-full h-44 object-cover rounded-xl border border-gray-200"
                />
              )}
            </div>
          </div>
        )}

        {/* Status & Tombol */}
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
            {loading ? 'Mengupload & Mencatat...' : 'Absen Masuk Sekarang'}
          </button>
        ) : !absenHariIni.jam_pulang ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
              Sudah absen masuk pukul <strong>{formatJam(absenHariIni.jam_masuk)}</strong>
            </div>
            <button
              onClick={handleAbsenPulang}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl transition duration-200 disabled:opacity-50"
            >
              {loading ? 'Mengupload & Mencatat...' : 'Absen Pulang Sekarang'}
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