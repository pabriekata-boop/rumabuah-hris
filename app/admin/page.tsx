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
  gaji_pokok?: number;
  shift_masuk?: string;
  shift_pulang?: string;
  hari_libur?: string;
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

interface Lembur {
  id: string;
  karyawan_id: string;
  tanggal: string;
  durasi_jam: number;
  alasan: string;
  status: string;
}

interface Kasbon {
  id: string;
  karyawan_id: string;
  tanggal: string;
  nominal: number;
  keperluan: string;
  status: string;
}

const OWNER_PIN = '9999';

export default function DashboardOwner() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [activeTab, setActiveTab] = useState<'absensi' | 'approval' | 'gaji' | 'karyawan'>('absensi');
  const [tanggalFilter, setTanggalFilter] = useState('');
  const [bulanFilter, setBulanFilter] = useState('');
  const [cabangFilter, setCabangFilter] = useState('Semua');

  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [daftarAbsensi, setDaftarAbsensi] = useState<Absensi[]>([]);
  const [daftarLembur, setDaftarLembur] = useState<Lembur[]>([]);
  const [daftarKasbon, setDaftarKasbon] = useState<Kasbon[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit PIN & Gaji Pokok
  const [editPins, setEditPins] = useState<Record<string, string>>({});
  const [editGaji, setEditGaji] = useState<Record<string, string>>({});
  const [editJadwal, setEditJadwal] = useState<
    Record<string, { masuk: string; pulang: string; libur: string }>
  >({});
  const [pesanSimpan, setPesanSimpan] = useState('');

  // Pengaturan Hitung Gaji
  const [tarifLemburPerJam, setTarifLemburPerJam] = useState('15000');
  const [bonusAntapani, setBonusAntapani] = useState('0');
  const [bonusJatinangor, setBonusJatinangor] = useState('0');
  const [potonganTelat, setPotonganTelat] = useState<Record<string, string>>({});
  const [savingGaji, setSavingGaji] = useState(false);

  // Modal lihat foto
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - offset).toISOString();
    setTanggalFilter(localIso.split('T')[0]);
    setBulanFilter(localIso.slice(0, 7)); // YYYY-MM
  }, []);

  const fetchKaryawan = useCallback(async () => {
    const { data } = await supabase.from('karyawan').select('*');
    if (data) {
      setDaftarKaryawan(data);
      const pinMap: Record<string, string> = {};
      const gajiMap: Record<string, string> = {};
      const jadwalMap: Record<string, { masuk: string; pulang: string; libur: string }> = {};
      data.forEach((k: Karyawan) => {
        pinMap[k.id] = k.pin || '1234';
        gajiMap[k.id] = String(k.gaji_pokok || 0);
        jadwalMap[k.id] = {
          masuk: k.shift_masuk || '08:00',
          pulang: k.shift_pulang || '17:00',
          libur: k.hari_libur || 'Senin',
        };
      });
      setEditPins(pinMap);
      setEditGaji(gajiMap);
      setEditJadwal(jadwalMap);
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
    if (data) setDaftarAbsensi(data);
    setLoading(false);
  }, []);

  const fetchPengajuan = useCallback(async () => {
    const [resLembur, resKasbon] = await Promise.all([
      supabase.from('lembur').select('*').order('tanggal', { ascending: false }),
      supabase.from('kasbon').select('*').order('tanggal', { ascending: false }),
    ]);
    if (resLembur.data) setDaftarLembur(resLembur.data);
    if (resKasbon.data) setDaftarKasbon(resKasbon.data);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchKaryawan();
      fetchPengajuan();
    }
  }, [isLoggedIn, fetchKaryawan, fetchPengajuan]);

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

  const handleUpdateKaryawan = async (karyawanId: string) => {
    const pinBaru = editPins[karyawanId]?.trim();
    const gajiBaru = Number(editGaji[karyawanId] || 0);
    const jadwalBaru = editJadwal[karyawanId] || { masuk: '08:00', pulang: '17:00', libur: '-' };

    if (!pinBaru || pinBaru.length < 4) {
      setPesanSimpan('❌ PIN minimal 4 digit.');
      return;
    }

    const { error } = await supabase
      .from('karyawan')
      .update({
        pin: pinBaru,
        gaji_pokok: gajiBaru,
        shift_masuk: jadwalBaru.masuk,
        shift_pulang: jadwalBaru.pulang,
        hari_libur: jadwalBaru.libur,
      })
      .eq('id', karyawanId);

    if (error) {
      setPesanSimpan('❌ Gagal update: ' + error.message);
    } else {
      setPesanSimpan('✅ Data & jadwal karyawan berhasil disimpan!');
      fetchKaryawan();
      setTimeout(() => setPesanSimpan(''), 3000);
    }
  };

  const handleStatusLembur = async (id: string, statusBaru: 'Approved' | 'Rejected') => {
    await supabase.from('lembur').update({ status: statusBaru }).eq('id', id);
    fetchPengajuan();
  };

  const handleStatusKasbon = async (id: string, statusBaru: 'Approved' | 'Rejected') => {
    await supabase.from('kasbon').update({ status: statusBaru }).eq('id', id);
    fetchPengajuan();
  };

  const formatJam = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRp = (angka: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(angka);

  const getNamaKaryawan = (id: string) => {
    const k = daftarKaryawan.find((item) => item.id === id);
    if (!k) return 'Karyawan';
    const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
    const cabang = k.cabang || k.lokasi_toko;
    return cabang ? `${nama} (${cabang})` : nama;
  };

  const karyawanFiltered = daftarKaryawan.filter((k) => {
    if (cabangFilter === 'Semua') return true;
    const cabang = (k.cabang || k.lokasi_toko || '').toLowerCase();
    return cabang.includes(cabangFilter.toLowerCase());
  });

  // Hitung jumlah karyawan per cabang untuk pembagian bonus rata
  const jumlahAntapani = daftarKaryawan.filter((k) =>
    (k.cabang || k.lokasi_toko || '').toLowerCase().includes('antapani')
  ).length;
  const jumlahJatinangor = daftarKaryawan.filter((k) =>
    (k.cabang || k.lokasi_toko || '').toLowerCase().includes('jatinangor')
  ).length;

  const hitungSlipKaryawan = (k: Karyawan) => {
    const cabang = (k.cabang || k.lokasi_toko || '').toLowerCase();
    const gajiPokok = k.gaji_pokok || 0;

    let bonus = 0;
    if (cabang.includes('antapani') && jumlahAntapani > 0) {
      bonus = Math.round(Number(bonusAntapani || 0) / jumlahAntapani);
    } else if (cabang.includes('jatinangor') && jumlahJatinangor > 0) {
      bonus = Math.round(Number(bonusJatinangor || 0) / jumlahJatinangor);
    }

    const totalJamLembur = daftarLembur
      .filter(
        (l) =>
          l.karyawan_id === k.id &&
          l.status === 'Approved' &&
          l.tanggal?.startsWith(bulanFilter)
      )
      .reduce((acc, cur) => acc + Number(cur.durasi_jam || 0), 0);

    const uangLembur = Math.round(totalJamLembur * Number(tarifLemburPerJam || 0));

    const totalKasbon = daftarKasbon
      .filter(
        (ks) =>
          ks.karyawan_id === k.id &&
          ks.status === 'Approved' &&
          ks.tanggal?.startsWith(bulanFilter)
      )
      .reduce((acc, cur) => acc + Number(cur.nominal || 0), 0);

    const dendaTelat = Number(potonganTelat[k.id] || 0);
    const totalGaji = gajiPokok + bonus + uangLembur - totalKasbon - dendaTelat;

    return {
      gajiPokok,
      bonus,
      totalJamLembur,
      uangLembur,
      totalKasbon,
      dendaTelat,
      totalGaji,
    };
  };

  const handleSimpanPenggajian = async () => {
    if (!bulanFilter) return;
    setSavingGaji(true);
    setPesanSimpan('');

    const rows = daftarKaryawan.map((k) => {
      const slip = hitungSlipKaryawan(k);
      return {
        karyawan_id: k.id,
        bulan: bulanFilter,
        gaji_pokok: slip.gajiPokok,
        bonus: slip.bonus,
        uang_lembur: slip.uangLembur,
        potongan_kasbon: slip.totalKasbon,
        potongan_telat: slip.dendaTelat,
        total_gaji: slip.totalGaji,
      };
    });

    const { error } = await supabase.from('penggajian').insert(rows);
    if (error) {
      setPesanSimpan('❌ Gagal menyimpan penggajian: ' + error.message);
    } else {
      setPesanSimpan(`✅ Rekap penggajian bulan ${bulanFilter} berhasil disimpan ke database!`);
    }
    setSavingGaji(false);
  };

  const pendingCount =
    daftarLembur.filter((l) => l.status === 'Pending').length +
    daftarKasbon.filter((k) => k.status === 'Pending').length;

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
      <div className="max-w-5xl mx-auto">
        {/* Header & Navigasi */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-green-700 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-green-800">Dashboard Owner</h1>
            <p className="text-sm text-gray-500">Ruma Buah HRIS — Antapani & Jatinangor</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('absensi')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === 'absensi'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Absensi
            </button>
            <button
              onClick={() => setActiveTab('approval')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'approval'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Approval
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('gaji')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === 'gaji'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Penggajian
            </button>
            <button
              onClick={() => setActiveTab('karyawan')}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === 'karyawan'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Karyawan & PIN
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

        {/* TAB 2: APPROVAL LEMBUR & KASBON */}
        {activeTab === 'approval' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daftar Lembur */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Pengajuan Lembur</h2>
                <button
                  onClick={fetchPengajuan}
                  className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-lg font-semibold"
                >
                  Refresh
                </button>
              </div>
              {daftarLembur.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Belum ada pengajuan lembur.</p>
              ) : (
                <div className="space-y-3">
                  {daftarLembur.map((l) => (
                    <div key={l.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50 text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-gray-800">{getNamaKaryawan(l.karyawan_id)}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            l.status === 'Approved'
                              ? 'bg-green-100 text-green-800'
                              : l.status === 'Rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {l.tanggal} • <strong>{l.durasi_jam} jam</strong>
                      </p>
                      <p className="text-gray-700 mt-1">{l.alasan}</p>
                      {l.status === 'Pending' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleStatusLembur(l.id, 'Approved')}
                            className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleStatusLembur(l.id, 'Rejected')}
                            className="flex-1 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Daftar Kasbon */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Pengajuan Kasbon</h2>
                <button
                  onClick={fetchPengajuan}
                  className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-lg font-semibold"
                >
                  Refresh
                </button>
              </div>
              {daftarKasbon.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Belum ada pengajuan kasbon.</p>
              ) : (
                <div className="space-y-3">
                  {daftarKasbon.map((ks) => (
                    <div key={ks.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50 text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-gray-800">{getNamaKaryawan(ks.karyawan_id)}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            ks.status === 'Approved'
                              ? 'bg-green-100 text-green-800'
                              : ks.status === 'Rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ks.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {ks.tanggal} • <strong className="text-green-800">{formatRp(ks.nominal)}</strong>
                      </p>
                      <p className="text-gray-700 mt-1">{ks.keperluan}</p>
                      {ks.status === 'Pending' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleStatusKasbon(ks.id, 'Approved')}
                            className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleStatusKasbon(ks.id, 'Rejected')}
                            className="flex-1 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PENGGAJIAN & BONUS RATA PER CABANG */}
        {activeTab === 'gaji' && (
          <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-green-50 p-4 rounded-xl">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Bulan Gaji</label>
                <input
                  type="month"
                  value={bulanFilter}
                  onChange={(e) => setBulanFilter(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Tarif Lembur / Jam (Rp)
                </label>
                <input
                  type="number"
                  value={tarifLemburPerJam}
                  onChange={(e) => setTarifLemburPerJam(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Total Bonus Antapani ({jumlahAntapani} org)
                </label>
                <input
                  type="number"
                  value={bonusAntapani}
                  onChange={(e) => setBonusAntapani(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Total Bonus Jatinangor ({jumlahJatinangor} org)
                </label>
                <input
                  type="number"
                  value={bonusJatinangor}
                  onChange={(e) => setBonusJatinangor(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="py-3 px-2">Karyawan</th>
                    <th className="py-3 px-2">Gaji Pokok</th>
                    <th className="py-3 px-2">Bonus Cabang</th>
                    <th className="py-3 px-2">Lembur</th>
                    <th className="py-3 px-2">Kasbon</th>
                    <th className="py-3 px-2">Pot. Telat (Rp)</th>
                    <th className="py-3 px-2 text-right">Total Terima</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarKaryawan.map((k) => {
                    const slip = hitungSlipKaryawan(k);
                    const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
                    const cabang = k.cabang || k.lokasi_toko || '-';
                    return (
                      <tr key={k.id} className="border-b border-gray-100">
                        <td className="py-3 px-2">
                          <div className="font-semibold text-gray-800">{nama}</div>
                          <div className="text-xs text-gray-400">{cabang}</div>
                        </td>
                        <td className="py-3 px-2">{formatRp(slip.gajiPokok)}</td>
                        <td className="py-3 px-2 text-green-700">+{formatRp(slip.bonus)}</td>
                        <td className="py-3 px-2 text-green-700">
                          +{formatRp(slip.uangLembur)}
                          <span className="block text-xs text-gray-400">({slip.totalJamLembur} jam)</span>
                        </td>
                        <td className="py-3 px-2 text-red-600">-{formatRp(slip.totalKasbon)}</td>
                        <td className="py-3 px-2">
                          <input
                            type="number"
                            min="0"
                            step="5000"
                            placeholder="0"
                            value={potonganTelat[k.id] || ''}
                            onChange={(e) =>
                              setPotonganTelat({ ...potonganTelat, [k.id]: e.target.value })
                            }
                            className="w-24 p-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-green-800">
                          {formatRp(slip.totalGaji)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pesanSimpan && (
              <p className="text-sm font-medium text-green-700">{pesanSimpan}</p>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSimpanPenggajian}
                disabled={savingGaji}
                className="px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-xl transition disabled:opacity-50"
              >
                {savingGaji ? 'Menyimpan...' : `Simpan Rekap Gaji (${bulanFilter})`}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: KELOLA KARYAWAN, PIN & GAJI POKOK */}
        {activeTab === 'karyawan' && (
          <div className="bg-white p-5 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Atur PIN & Gaji Pokok Karyawan</h2>
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
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{nama}</p>
                      <p className="text-xs text-gray-500">{cabang}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div>
                        <span className="text-xs text-gray-500 block">Gaji Pokok (Rp)</span>
                        <input
                          type="number"
                          step="50000"
                          value={editGaji[k.id] || ''}
                          onChange={(e) =>
                            setEditGaji({ ...editGaji, [k.id]: e.target.value })
                          }
                          className="w-36 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">PIN</span>
                        <input
                          type="text"
                          maxLength={6}
                          value={editPins[k.id] || ''}
                          onChange={(e) =>
                            setEditPins({ ...editPins, [k.id]: e.target.value })
                          }
                          className="w-24 p-2 border border-gray-300 rounded-lg text-center text-sm font-mono bg-white"
                        />
                      </div>
                      <button
                        onClick={() => handleUpdateKaryawan(k.id)}
                        className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg"
                      ><div>
                        <span className="text-xs text-gray-500 block">Masuk</span>
                        <input
                          type="time"
                          value={editJadwal[k.id]?.masuk || '08:00'}
                          onChange={(e) =>
                            setEditJadwal({
                              ...editJadwal,
                              [k.id]: { ...editJadwal[k.id], masuk: e.target.value },
                            })
                          }
                          className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Pulang</span>
                        <input
                          type="time"
                          value={editJadwal[k.id]?.pulang || '17:00'}
                          onChange={(e) =>
                            setEditJadwal({
                              ...editJadwal,
                              [k.id]: { ...editJadwal[k.id], pulang: e.target.value },
                            })
                          }
                          className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Libur</span>
                        <input
                          type="text"
                          placeholder="Misal: Senin"
                          value={editJadwal[k.id]?.libur || ''}
                          onChange={(e) =>
                            setEditJadwal({
                              ...editJadwal,
                              [k.id]: { ...editJadwal[k.id], libur: e.target.value },
                            })
                          }
                          className="w-24 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
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