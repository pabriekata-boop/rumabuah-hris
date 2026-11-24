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
  shift_masuk?: string;
  shift_pulang?: string;
  hari_libur?: string;
}

interface AbsensiHariIni {
  id: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  foto_masuk?: string | null;
  foto_pulang?: string | null;
  status_kehadiran: string;
}

export default function HalamanKaryawan() {
  const [activeTab, setActiveTab] = useState<'absen' | 'lembur' | 'kasbon'>('absen');
  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [tanggalHariIni, setTanggalHariIni] = useState('');
  const [tanggalTampil, setTanggalTampil] = useState('');

  // State Absen
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [absenHariIni, setAbsenHariIni] = useState<AbsensiHariIni | null>(null);
  const [checking, setChecking] = useState(false);

  // State Lembur
  const [tanggalLembur, setTanggalLembur] = useState('');
  const [durasiJam, setDurasiJam] = useState('');
  const [alasanLembur, setAlasanLembur] = useState('');

  // State Kasbon
  const [nominalKasbon, setNominalKasbon] = useState('');
  const [keperluanKasbon, setKeperluanKasbon] = useState('');

  // State Umum
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState('');

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(now.getTime() - offset).toISOString().split('T')[0];

    setTanggalHariIni(todayStr);
    setTanggalLembur(todayStr);
    setTanggalTampil(
      now.toLocaleDateString('id-ID', {
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

    if (!selectedId || !tanggalHariIni) {
      setAbsenHariIni(null);
      return;
    }

    const cekAbsenHariIni = async () => {
      setChecking(true);
      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('karyawan_id', selectedId)
        .eq('tanggal', tanggalHariIni)
        .maybeSingle();

      if (error) {
        setPesan('❌ Gagal cek absensi: ' + error.message);
      } else {
        setAbsenHariIni(data);
      }
      setChecking(false);
    };

    cekAbsenHariIni();
  }, [selectedId, tanggalHariIni]);

  const validasiPin = () => {
    if (!selectedId) {
      setPesan('❌ Pilih nama karyawan terlebih dahulu.');
      return false;
    }
    const karyawan = daftarKaryawan.find((k) => k.id === selectedId);
    const pinBenar = karyawan?.pin || '1234';
    if (pinInput.trim() !== pinBenar) {
      setPesan('❌ PIN salah! Silakan cek kembali PIN Anda.');
      return false;
    }
    return true;
  };

  // --- LOGIKA ABSEN ---
  const handlePilihFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadFoto = async (tipe: 'masuk' | 'pulang') => {
    if (!fotoFile) return null;
    const ext = fotoFile.name.split('.').pop() || 'jpg';
    const fileName = `${tanggalHariIni}/${selectedId}-${tipe}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('foto-absensi')
      .upload(fileName, fotoFile);

    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('foto-absensi').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleAbsenMasuk = async () => {
    if (!validasiPin()) return;
    if (!fotoFile) {
      setPesan('❌ Wajib ambil foto selfie terlebih dahulu.');
      return;
    }
    setLoading(true);
    setPesan('');

    try {
      const fotoUrl = await uploadFoto('masuk');
      const { data, error } = await supabase
        .from('absensi')
        .insert([
          {
            karyawan_id: selectedId,
            tanggal: tanggalHariIni,
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
    if (!absenHariIni || !validasiPin()) return;
    if (!fotoFile) {
      setPesan('❌ Wajib ambil foto selfie terlebih dahulu.');
      return;
    }
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

  // --- LOGIKA LEMBUR ---
  const handleAjukanLembur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validasiPin()) return;
    if (!durasiJam || Number(durasiJam) <= 0 || !alasanLembur.trim()) {
      setPesan('❌ Lengkapi durasi jam dan alasan lembur.');
      return;
    }

    setLoading(true);
    setPesan('');
    try {
      const { error } = await supabase.from('lembur').insert([
        {
          karyawan_id: selectedId,
          tanggal: tanggalLembur || tanggalHariIni,
          durasi_jam: Number(durasiJam),
          alasan: alasanLembur.trim(),
          status: 'Pending',
        },
      ]);

      if (error) throw error;
      setDurasiJam('');
      setAlasanLembur('');
      setPinInput('');
      setPesan('✅ Pengajuan lembur terkirim! Menunggu persetujuan Owner.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal mengajukan lembur: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIKA KASBON ---
  const handleAjukanKasbon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validasiPin()) return;
    const nominalAngka = Number(nominalKasbon.replace(/\D/g, ''));
    if (!nominalAngka || nominalAngka < 10000 || !keperluanKasbon.trim()) {
      setPesan('❌ Masukkan nominal (min Rp 10.000) dan keperluan kasbon.');
      return;
    }

    setLoading(true);
    setPesan('');
    try {
      const { error } = await supabase.from('kasbon').insert([
        {
          karyawan_id: selectedId,
          tanggal: tanggalHariIni,
          nominal: nominalAngka,
          keperluan: keperluanKasbon.trim(),
          status: 'Pending',
        },
      ]);

      if (error) throw error;
      setNominalKasbon('');
      setKeperluanKasbon('');
      setPinInput('');
      setPesan('✅ Pengajuan kasbon terkirim! Menunggu persetujuan Owner.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal mengajukan kasbon: ' + msg);
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
        <p className="text-sm text-gray-500 mb-5 min-h-[20px]">{tanggalTampil}</p>

        {/* Tab Navigasi */}
        <div className="grid grid-cols-3 gap-1 bg-green-50 p-1 rounded-xl mb-5">
          {(['absen', 'lembur', 'kasbon'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setPesan('');
              }}
              className={`py-2 text-xs font-bold rounded-lg capitalize transition ${
                activeTab === tab
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-green-800 hover:bg-green-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Pilih Nama (Berlaku untuk semua tab) */}
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
          {selectedId && (() => {
            const k = daftarKaryawan.find((item) => item.id === selectedId);
            if (!k) return null;
            return (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-900 flex justify-between items-center">
                <div>
                  <span className="text-gray-500 block">Jam Kerja</span>
                  <strong className="text-sm">
                    {k.shift_masuk || '08:00'} - {k.shift_pulang || '17:00'}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-gray-500 block">Hari Libur</span>
                  <strong className="text-sm">{k.hari_libur || '-'}</strong>
                </div>
              </div>
            );
          })()}
        </div>

        {/* TAB 1: ABSENSI */}
        {activeTab === 'absen' && (
          <div>
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
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition disabled:opacity-50"
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
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl transition disabled:opacity-50"
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
          </div>
        )}

        {/* TAB 2: LEMBUR */}
        {activeTab === 'lembur' && (
          <form onSubmit={handleAjukanLembur} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Tanggal Lembur
              </label>
              <input
                type="date"
                value={tanggalLembur}
                onChange={(e) => setTanggalLembur(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Durasi Lembur (Jam)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="Contoh: 2 atau 1.5"
                value={durasiJam}
                onChange={(e) => setDurasiJam(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Alasan / Pekerjaan Lembur
              </label>
              <textarea
                rows={2}
                placeholder="Contoh: Bongkar muat buah malam / siapkan parsel"
                value={alasanLembur}
                onChange={(e) => setAlasanLembur(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

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
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50"
            >
              {loading ? 'Mengirim...' : 'Ajukan Lembur'}
            </button>
          </form>
        )}

        {/* TAB 3: KASBON */}
        {activeTab === 'kasbon' && (
          <form onSubmit={handleAjukanKasbon} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nominal Kasbon (Rp)
              </label>
              <input
                type="number"
                step="10000"
                min="10000"
                placeholder="Contoh: 100000"
                value={nominalKasbon}
                onChange={(e) => setNominalKasbon(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Keperluan
              </label>
              <textarea
                rows={2}
                placeholder="Contoh: Kebutuhan mendadak keluarga"
                value={keperluanKasbon}
                onChange={(e) => setKeperluanKasbon(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

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
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50"
            >
              {loading ? 'Mengirim...' : 'Ajukan Kasbon'}
            </button>
          </form>
        )}

        {pesan && (
          <p className="mt-4 text-sm font-medium text-gray-700">{pesan}</p>
        )}
      </div>
    </div>
  );
}