'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface Karyawan {
  id: string;
  nama?: string;
  nama_lengkap?: string;
  cabang?: string;
  lokasi_toko?: string;
  pin?: string;
}

interface Absensi {
  id: string;
  karyawan_id: string;
  tanggal: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
  foto_masuk: string | null;
  foto_pulang: string | null;
  status_kehadiran: string;
}

// Ubah PIN Owner di sini sesuai keinginan Anda
const OWNER_PIN = '9999';

export default function DashboardOwner() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [activeTab, setActiveTab] = useState<'absensi' | 'karyawan'>('absensi');
  const [tanggalFilter, setTanggalFilter] = useState('');
  const [cabangFilter, setCabangFilter] = useState('Semua');

  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [daftarAbsensi, setDaftarAbsensi] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(false);

  // State untuk edit PIN karyawan
  const [editPins, setEditPins] = useState<Record<string, string>>({});
  const [pesanSimpan, setPesanSimpan] = useState('');

  // Modal lihat foto
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  // Set tanggal default hari ini di browser (hindari error prerender Next.js)
  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const today = new Date(now.getTime() - offset).toISOString().split('T')[0];
    setTanggalFilter(today);
  }, []);

  const fetchKaryawan = useCallback(async () => {
    const { data } = await supabase.from('karyawan').select('*');
    if (data) {
      setDaftarKaryawan(data);
      const pinMap: Record<string, string> = {};
      data.forEach((k: Karyawan) => {
        pinMap[k.id] = k.pin || '1234';
      });
      setEditPins(pinMap);
    }
  }, []);

  const fetchAbsensi = useCallback(async (tgl: string) => {
    if (!tgl) return;
    setLoading(true);
    const { data } = await supabase
      .from('absensi')
      .select('*')
      .eq('tanggal', tgl)
      .order('jam_masuk', { ascending: true });

    if (data) {
      setDaftarAbsensi(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchKaryawan();
    }
  }, [isLoggedIn, fetchKaryawan]);

  useEffect(() => {
    if (isLoggedIn && tanggalFilter) {
      fetchAbsensi(tanggalFilter);
    }
  }, [isLoggedIn, tanggalFilter, fetchAbsensi]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === OWNER_PIN) {
      setIsLoggedIn(true);
      setPinError('');
    } else {
      setPinError('PIN Owner salah.');
    }
  };

  const handleUpdatePin = async (karyawanId: string) => {
    const pinBaru = editPins[karyawanId]?.trim();
    if (!pinBaru || pinBaru.length < 4) {
      setPesanSimpan('❌ PIN minimal 4 digit.');
      return;
    }

    const { error } = await supabase
      .from('karyawan')
      .update({ pin: pinBaru })
      .eq('id', karyawanId);

    if (error) {
      setPesanSimpan('❌ Gagal update PIN: ' + error.message);
    } else {
      setPesanSimpan('✅ PIN berhasil diperbarui!');
      fetchKaryawan();
      setTimeout(() => setPesanSimpan(''), 3000);
    }
  };

  const formatJam = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getKaryawan = (id: string) => daftarKaryawan.find((k) => k.id === id);

  // Filter karyawan berdasarkan cabang
  const karyawanFiltered = daftarKaryawan.filter((k) => {
    if (cabangFilter === 'Semua') return true;
    const cabang = (k.cabang || k.lokasi_toko || '').toLowerCase();
    return cabang.includes(cabangFilter.toLowerCase());
  });

  // Tampilan Login Owner
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-700"
        >
          <h1 className="text-2xl font-bold text-green-800 mb-1">Owner HRIS</h1>
          <p className="text-sm text-gray-500 mb-6">Ruma Buah Antapani & Jatinangor</p>

          <input
            type="password"
            inputMode="numeric"
            placeholder="Masukkan PIN Owner"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-xl text-center text-lg tracking-widest mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
          />

          {pinError && <p className="text-sm text-red-600 mb-4">{pinError}</p>}

          <button
            type="submit"
            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-xl transition"
          >
            Masuk Dashboard
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-green-700 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-green-800">Dashboard Owner</h1>
            <p className="text-sm text-gray-500">Ruma Buah HRIS — Antapani & Jatinangor</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('absensi')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === 'absensi'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Rekap Absensi
            </button>
            <button
              onClick={() => setActiveTab('karyawan')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === 'karyawan'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Kelola PIN
            </button>
          </div>
        </div>

        {/* TAB 1: REKAP ABSENSI */}
        {activeTab === 'absensi' && (
          <div className="bg-white p-5 rounded-2xl shadow-sm">
            <div className="flex flex-wrap gap-3 mb-5 items-center justify-between">
              <div className="flex flex-wrap gap-3">
                <input
                  type="date"
                  value={tanggalFilter}
                  onChange={(e) => setTanggalFilter(e.target.value)}
                  className="p-2 border border-gray-300 rounded-xl text-sm text-gray-800"
                />
                <select
                  value={cabangFilter}
                  onChange={(e) => setCabangFilter(e.target.value)}
                  className="p-2 border border-gray-300 rounded-xl text-sm text-gray-800 bg-white"
                >
                  <option value="Semua">Semua Cabang</option>
                  <option value="Antapani">Antapani</option>
                  <option value="Jatinangor">Jatinangor</option>
                </select>
              </div>
              <button
                onClick={() => fetchAbsensi(tanggalFilter)}
                className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-sm font-semibold rounded-xl"
              >
                Refresh Data
              </button>
            </div>

            {loading ? (
              <p className="text-center text-gray-500 py-8">Memuat data absensi...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-3 px-2">Karyawan</th>
                      <th className="py-3 px-2">Cabang</th>
                      <th className="py-3 px-2">Masuk</th>
                      <th className="py-3 px-2">Pulang</th>
                      <th className="py-3 px-2">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karyawanFiltered.map((k) => {
                      const absen = daftarAbsensi.find((a) => a.karyawan_id === k.id);
                      const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
                      const cabang = k.cabang || k.lokasi_toko || '-';

                      return (
                        <tr key={k.id} className="border-b border-gray-100 hover:bg-green-50/50">
                          <td className="py-3 px-2 font-semibold text-gray-800">{nama}</td>
                          <td className="py-3 px-2 text-gray-600">{cabang}</td>
                          <td className="py-3 px-2">
                            {absen?.jam_masuk ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-lg font-medium">
                                {formatJam(absen.jam_masuk)}
                              </span>
                            ) : (
                              <span className="text-gray-400">Belum absen</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            {absen?.jam_pulang ? (
                              <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg font-medium">
                                {formatJam(absen.jam_pulang)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-2 flex gap-2">
                            {absen?.foto_masuk && (
                              <button
                                onClick={() => setFotoModal(absen.foto_masuk)}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                              >
                                Foto Masuk
                              </button>
                            )}
                            {absen?.foto_pulang && (
                              <button
                                onClick={() => setFotoModal(absen.foto_pulang)}
                                className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                              >
                                Foto Pulang
                              </button>
                            )}
                            {!absen?.foto_masuk && !absen?.foto_pulang && (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: KELOLA PIN KARYAWAN */}
        {activeTab === 'karyawan' && (
          <div className="bg-white p-5 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Atur PIN Karyawan</h2>
            {pesanSimpan && (
              <p className="mb-4 text-sm font-medium text-green-700">{pesanSimpan}</p>
            )}
            <div className="space-y-3">
              {daftarKaryawan.map((k) => {
                const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
                const cabang = k.cabang || k.lokasi_toko || '-';
                return (
                  <div
                    key={k.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{nama}</p>
                      <p className="text-xs text-gray-500">{cabang}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={editPins[k.id] || ''}
                        onChange={(e) =>
                          setEditPins({ ...editPins, [k.id]: e.target.value })
                        }
                        className="w-28 p-2 border border-gray-300 rounded-lg text-center text-sm font-mono bg-white"
                      />
                      <button
                        onClick={() => handleUpdatePin(k.id)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg"
                      >
                        Simpan
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Preview Foto */}
        {fotoModal && (
          <div
            onClick={() => setFotoModal(null)}
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          >
            <div className="bg-white p-3 rounded-2xl max-w-md w-full">
              <img
                src={fotoModal}
                alt="Foto Absensi"
                className="w-full max-h-[75vh] object-contain rounded-xl"
              />
              <button
                onClick={() => setFotoModal(null)}
                className="mt-3 w-full py-2 bg-gray-800 text-white rounded-xl text-sm font-semibold"
              >
                Tutup Foto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}