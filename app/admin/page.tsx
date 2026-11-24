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
  role?: string;
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

interface JadwalShift {
  id?: string;
  karyawan_id: string;
  tanggal: string;
  shift: string;
  jam_masuk: string;
  jam_pulang: string;
}

interface Lembur {
  id: string;
  karyawan_id: string;
  tanggal: string;
  durasi_jam: number;
  alasan: string;
  status: string;
  disetujui_oleh?: string | null;
}

interface Kasbon {
  id: string;
  karyawan_id: string;
  tanggal: string;
  nominal: number;
  keperluan: string;
  status: string;
  disetujui_oleh?: string | null;
}

interface CurrentUser {
  role: 'owner' | 'manajer';
  id: string;
  nama: string;
}

const OWNER_PIN = '9999';

const PRESET_SHIFT: Record<string, { masuk: string; pulang: string }> = {
  Pagi: { masuk: '08:00', pulang: '17:00' },
  Siang: { masuk: '12:00', pulang: '21:00' },
  Full: { masuk: '08:00', pulang: '21:00' },
  Libur: { masuk: '', pulang: '' },
};

export default function DashboardAdmin() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'absensi' | 'jadwal' | 'approval' | 'gaji' | 'karyawan'
  >('absensi');
  const [tanggalFilter, setTanggalFilter] = useState('');
  const [tanggalJadwal, setTanggalJadwal] = useState('');
  const [bulanFilter, setBulanFilter] = useState('');
  const [cabangFilter, setCabangFilter] = useState('Semua');

  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [daftarAbsensi, setDaftarAbsensi] = useState<Absensi[]>([]);
  const [daftarLembur, setDaftarLembur] = useState<Lembur[]>([]);
  const [daftarKasbon, setDaftarKasbon] = useState<Kasbon[]>([]);
  const [loading, setLoading] = useState(false);

  // State Jadwal per Tanggal
  const [jadwalInput, setJadwalInput] = useState<
    Record<string, { shift: string; jam_masuk: string; jam_pulang: string }>
  >({});
  const [savingJadwal, setSavingJadwal] = useState(false);
  const [pesanJadwal, setPesanJadwal] = useState('');

  // Form Tambah Karyawan Baru
  const [namaBaru, setNamaBaru] = useState('');
  const [cabangBaru, setCabangBaru] = useState('Antapani');
  const [roleBaru, setRoleBaru] = useState('staf');
  const [gajiBaruInput, setGajiBaruInput] = useState('');
  const [pinBaruInput, setPinBaruInput] = useState('');
  const [addingKaryawan, setAddingKaryawan] = useState(false);

  // Edit PIN, Gaji Pokok & Role
  const [editPins, setEditPins] = useState<Record<string, string>>({});
  const [editGaji, setEditGaji] = useState<Record<string, string>>({});
  const [editRoles, setEditRoles] = useState<Record<string, string>>({});
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
    const today = localIso.split('T')[0];
    setTanggalFilter(today);
    setTanggalJadwal(today);
    setBulanFilter(localIso.slice(0, 7));
  }, []);

  const fetchKaryawan = useCallback(async () => {
    const { data } = await supabase.from('karyawan').select('*');
    if (data) {
      setDaftarKaryawan(data);
      const pinMap: Record<string, string> = {};
      const gajiMap: Record<string, string> = {};
      const roleMap: Record<string, string> = {};
      data.forEach((k: Karyawan) => {
        pinMap[k.id] = k.pin || '1234';
        gajiMap[k.id] = String(k.gaji_pokok || 0);
        roleMap[k.id] = k.role || 'staf';
      });
      setEditPins(pinMap);
      setEditGaji(gajiMap);
      setEditRoles(roleMap);
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

  const fetchJadwalTanggal = useCallback(
    async (tgl: string, listKaryawan: Karyawan[]) => {
      if (!tgl || listKaryawan.length === 0) return;
      const { data } = await supabase
        .from('jadwal_shift')
        .select('*')
        .eq('tanggal', tgl);

      const map: Record<string, { shift: string; jam_masuk: string; jam_pulang: string }> = {};
      listKaryawan.forEach((k) => {
        const found = data?.find((j: JadwalShift) => j.karyawan_id === k.id);
        if (found) {
          map[k.id] = {
            shift: found.shift || 'Pagi',
            jam_masuk: found.jam_masuk || '',
            jam_pulang: found.jam_pulang || '',
          };
        } else {
          map[k.id] = { shift: 'Pagi', jam_masuk: '08:00', jam_pulang: '17:00' };
        }
      });
      setJadwalInput(map);
    },
    []
  );

  const fetchPengajuan = useCallback(async () => {
    const [resLembur, resKasbon] = await Promise.all([
      supabase.from('lembur').select('*').order('tanggal', { ascending: false }),
      supabase.from('kasbon').select('*').order('tanggal', { ascending: false }),
    ]);
    if (resLembur.data) setDaftarLembur(resLembur.data);
    if (resKasbon.data) setDaftarKasbon(resKasbon.data);
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchKaryawan();
      fetchPengajuan();
    }
  }, [currentUser, fetchKaryawan, fetchPengajuan]);

  useEffect(() => {
    if (currentUser && tanggalFilter) {
      fetchAbsensi(tanggalFilter);
    }
  }, [currentUser, tanggalFilter, fetchAbsensi]);

  useEffect(() => {
    if (currentUser && tanggalJadwal && daftarKaryawan.length > 0) {
      fetchJadwalTanggal(tanggalJadwal, daftarKaryawan);
    }
  }, [currentUser, tanggalJadwal, daftarKaryawan, fetchJadwalTanggal]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const pin = pinInput.trim();

    if (pin === OWNER_PIN) {
      setCurrentUser({ role: 'owner', id: 'owner', nama: 'Owner' });
      setPinInput('');
      return;
    }

    setLoginLoading(true);
    const { data, error } = await supabase
      .from('karyawan')
      .select('*')
      .eq('role', 'manajer')
      .eq('pin', pin)
      .maybeSingle();
    setLoginLoading(false);

    if (error) {
      setPinError('Gagal mengecek PIN: ' + error.message);
      return;
    }

    if (data) {
      setCurrentUser({
        role: 'manajer',
        id: data.id,
        nama: data.nama || data.nama_lengkap || 'Manajer',
      });
      setActiveTab('approval');
      setPinInput('');
    } else {
      setPinError('PIN salah atau akun tidak memiliki akses admin/manajer.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('absensi');
    setPinInput('');
  };

  const handleTambahKaryawan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaBaru.trim()) {
      setPesanSimpan('❌ Nama karyawan wajib diisi.');
      return;
    }
    const pinClean = pinBaruInput.trim() || '1234';
    if (pinClean.length < 4) {
      setPesanSimpan('❌ PIN minimal 4 digit.');
      return;
    }

    setAddingKaryawan(true);
    setPesanSimpan('');

    // Deteksi otomatis nama kolom di tabel karyawan Supabase Anda
    const sample = daftarKaryawan[0];
    const kolomNama = sample && 'nama_lengkap' in sample && !('nama' in sample) ? 'nama_lengkap' : 'nama';
    const kolomCabang = sample && 'lokasi_toko' in sample && !('cabang' in sample) ? 'lokasi_toko' : 'cabang';

    const payload: Record<string, unknown> = {
      [kolomNama]: namaBaru.trim(),
      [kolomCabang]: cabangBaru,
      role: roleBaru,
      gaji_pokok: Number(gajiBaruInput || 0),
      pin: pinClean,
    };

    const { error } = await supabase.from('karyawan').insert([payload]);

    if (error) {
      setPesanSimpan('❌ Gagal menambah karyawan: ' + error.message);
    } else {
      setNamaBaru('');
      setGajiBaruInput('');
      setPinBaruInput('');
      setRoleBaru('staf');
      setPesanSimpan('✅ Karyawan baru berhasil ditambahkan!');
      fetchKaryawan();
      setTimeout(() => setPesanSimpan(''), 3000);
    }
    setAddingKaryawan(false);
  };

  const handleHapusKaryawan = async (id: string, nama: string) => {
    const konfirmasi = window.confirm(`Yakin ingin menghapus karyawan "${nama}"?`);
    if (!konfirmasi) return;

    const { error } = await supabase.from('karyawan').delete().eq('id', id);
    if (error) {
      setPesanSimpan('❌ Gagal menghapus: ' + error.message);
    } else {
      setPesanSimpan(`✅ Karyawan "${nama}" berhasil dihapus.`);
      fetchKaryawan();
      setTimeout(() => setPesanSimpan(''), 3000);
    }
  };

  const handleUbahShift = (karyawanId: string, shiftBaru: string) => {
    const preset = PRESET_SHIFT[shiftBaru] || { masuk: '08:00', pulang: '17:00' };
    setJadwalInput((prev) => ({
      ...prev,
      [karyawanId]: {
        shift: shiftBaru,
        jam_masuk: preset.masuk,
        jam_pulang: preset.pulang,
      },
    }));
  };

  const handleSimpanJadwal = async () => {
    if (!tanggalJadwal) return;
    setSavingJadwal(true);
    setPesanJadwal('');

    const rows = stafUntukJadwal.map((k) => {
      const j = jadwalInput[k.id] || { shift: 'Pagi', jam_masuk: '08:00', jam_pulang: '17:00' };
      return {
        karyawan_id: k.id,
        tanggal: tanggalJadwal,
        shift: j.shift,
        jam_masuk: j.shift === 'Libur' ? '' : j.jam_masuk,
        jam_pulang: j.shift === 'Libur' ? '' : j.jam_pulang,
      };
    });

    const { error } = await supabase
      .from('jadwal_shift')
      .upsert(rows, { onConflict: 'karyawan_id,tanggal' });

    if (error) {
      setPesanJadwal('❌ Gagal simpan jadwal: ' + error.message);
    } else {
      setPesanJadwal(`✅ Jadwal tanggal ${tanggalJadwal} berhasil disimpan!`);
      setTimeout(() => setPesanJadwal(''), 3000);
    }
    setSavingJadwal(false);
  };

  const handleUpdateKaryawan = async (karyawanId: string) => {
    const pinBaru = editPins[karyawanId]?.trim();
    const gajiBaru = Number(editGaji[karyawanId] || 0);
    const roleEdit = editRoles[karyawanId] || 'staf';

    if (!pinBaru || pinBaru.length < 4) {
      setPesanSimpan('❌ PIN minimal 4 digit.');
      return;
    }

    const { error } = await supabase
      .from('karyawan')
      .update({ pin: pinBaru, gaji_pokok: gajiBaru, role: roleEdit })
      .eq('id', karyawanId);

    if (error) {
      setPesanSimpan('❌ Gagal update: ' + error.message);
    } else {
      setPesanSimpan('✅ Data karyawan berhasil disimpan!');
      fetchKaryawan();
      setTimeout(() => setPesanSimpan(''), 3000);
    }
  };

  const handleStatusLembur = async (id: string, statusBaru: 'Approved' | 'Rejected') => {
    await supabase
      .from('lembur')
      .update({
        status: statusBaru,
        disetujui_oleh: currentUser?.nama || 'Admin',
      })
      .eq('id', id);
    fetchPengajuan();
  };

  const handleStatusKasbon = async (id: string, statusBaru: 'Approved' | 'Rejected') => {
    await supabase
      .from('kasbon')
      .update({
        status: statusBaru,
        disetujui_oleh: currentUser?.nama || 'Admin',
      })
      .eq('id', id);
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

  const stafUntukJadwal = karyawanFiltered.filter((k) => k.role !== 'manajer');

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
      setPesanSimpan(`✅ Rekap penggajian bulan ${bulanFilter} berhasil disimpan!`);
    }
    setSavingGaji(false);
  };

  const pendingCount =
    daftarLembur.filter((l) => l.status === 'Pending').length +
    daftarKasbon.filter((k) => k.status === 'Pending').length;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-700"
        >
          <h1 className="text-2xl font-bold text-green-800 mb-1">Admin Ruma Buah</h1>
          <p className="text-sm text-gray-500 mb-6">Login Owner atau Manajer</p>

          <input
            type="password"
            inputMode="numeric"
            placeholder="Masukkan PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-xl text-center text-lg tracking-widest mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
          />

          {pinError && <p className="text-sm text-red-600 mb-4">{pinError}</p>}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-xl transition disabled:opacity-50"
          >
            {loginLoading ? 'Mengecek...' : 'Masuk Dashboard'}
          </button>
        </form>
      </div>
    );
  }

  const isOwner = currentUser.role === 'owner';

  const tabsTersedia = isOwner
    ? ([
        { id: 'absensi', label: 'Absensi' },
        { id: 'jadwal', label: 'Jadwal Shift' },
        { id: 'approval', label: 'Approval' },
        { id: 'gaji', label: 'Penggajian' },
        { id: 'karyawan', label: 'Karyawan & PIN' },
      ] as const)
    : ([
        { id: 'absensi', label: 'Absensi' },
        { id: 'jadwal', label: 'Jadwal Shift' },
        { id: 'approval', label: 'Approval' },
      ] as const);

  return (
    <div className="min-h-screen bg-green-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header & Navigasi */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-green-700 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-green-800">
                {isOwner ? 'Dashboard Owner' : 'Dashboard Manajer'}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">
                {currentUser.nama}
              </span>
            </div>
            <p className="text-sm text-gray-500">Ruma Buah HRIS — Antapani & Jatinangor</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tabsTersedia.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-green-700 text-white'
                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                }`}
              >
                {tab.label}
                {tab.id === 'approval' && pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Keluar
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
                          <td className="py-3 px-2 font-semibold text-gray-800">
                            {nama}
                            {k.role === 'manajer' && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                Manajer
                              </span>
                            )}
                          </td>
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

        {/* TAB 2: JADWAL SHIFT PER TANGGAL */}
        {activeTab === 'jadwal' && (
          <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Pilih Tanggal</span>
                  <input
                    type="date"
                    value={tanggalJadwal}
                    onChange={(e) => setTanggalJadwal(e.target.value)}
                    className="p-2 border border-gray-300 rounded-xl text-sm text-gray-800"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Filter Cabang</span>
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
              </div>

              <button
                onClick={handleSimpanJadwal}
                disabled={savingJadwal}
                className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-50"
              >
                {savingJadwal ? 'Menyimpan...' : 'Simpan Jadwal Tanggal Ini'}
              </button>
            </div>

            {pesanJadwal && (
              <p className="text-sm font-medium text-green-700">{pesanJadwal}</p>
            )}

            <div className="space-y-3">
              {stafUntukJadwal.map((k) => {
                const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
                const cabang = k.cabang || k.lokasi_toko || '-';
                const j = jadwalInput[k.id] || {
                  shift: 'Pagi',
                  jam_masuk: '08:00',
                  jam_pulang: '17:00',
                };

                return (
                  <div
                    key={k.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 border border-gray-100 rounded-xl bg-gray-50"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{nama}</p>
                      <p className="text-xs text-gray-500">{cabang}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={j.shift}
                        onChange={(e) => handleUbahShift(k.id, e.target.value)}
                        className={`p-2 border rounded-lg text-sm font-semibold ${
                          j.shift === 'Libur'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-white border-gray-300 text-gray-800'
                        }`}
                      >
                        <option value="Pagi">Shift Pagi</option>
                        <option value="Siang">Shift Siang</option>
                        <option value="Full">Shift Full</option>
                        <option value="Libur">Libur</option>
                      </select>

                      {j.shift !== 'Libur' && (
                        <>
                          <input
                            type="time"
                            value={j.jam_masuk}
                            onChange={(e) =>
                              setJadwalInput((prev) => ({
                                ...prev,
                                [k.id]: { ...prev[k.id], jam_masuk: e.target.value },
                              }))
                            }
                            className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                          />
                          <span className="text-gray-400 text-xs">s/d</span>
                          <input
                            type="time"
                            value={j.jam_pulang}
                            onChange={(e) =>
                              setJadwalInput((prev) => ({
                                ...prev,
                                [k.id]: { ...prev[k.id], jam_pulang: e.target.value },
                              }))
                            }
                            className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: APPROVAL LEMBUR & KASBON */}
        {activeTab === 'approval' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  {daftarLembur.map((l) => {
                    const isSelfRequest =
                      currentUser.role === 'manajer' && l.karyawan_id === currentUser.id;

                    return (
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
                        {l.disetujui_oleh && (
                          <p className="text-xs text-gray-400 mt-1">
                            Diproses oleh: {l.disetujui_oleh}
                          </p>
                        )}
                        {l.status === 'Pending' &&
                          (isSelfRequest ? (
                            <p className="mt-2 text-xs italic text-amber-700">
                              Pengajuan pribadi hanya bisa disetujui oleh Owner.
                            </p>
                          ) : (
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
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
                  {daftarKasbon.map((ks) => {
                    const isSelfRequest =
                      currentUser.role === 'manajer' && ks.karyawan_id === currentUser.id;

                    return (
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
                        {ks.disetujui_oleh && (
                          <p className="text-xs text-gray-400 mt-1">
                            Diproses oleh: {ks.disetujui_oleh}
                          </p>
                        )}
                        {ks.status === 'Pending' &&
                          (isSelfRequest ? (
                            <p className="mt-2 text-xs italic text-amber-700">
                              Pengajuan pribadi hanya bisa disetujui oleh Owner.
                            </p>
                          ) : (
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
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PENGGAJIAN (Khusus Owner) */}
        {isOwner && activeTab === 'gaji' && (
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

        {/* TAB 5: TAMBAH & KELOLA KARYAWAN (Khusus Owner) */}
        {isOwner && activeTab === 'karyawan' && (
          <div className="space-y-6">
            {/* Form Tambah Karyawan Baru */}
            <form
              onSubmit={handleTambahKaryawan}
              className="bg-white p-5 rounded-2xl shadow-sm border border-green-100"
            >
              <h2 className="text-lg font-bold text-green-800 mb-4">+ Tambah Karyawan Baru</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Nama Karyawan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Budi"
                    value={namaBaru}
                    onChange={(e) => setNamaBaru(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cabang</label>
                  <select
                    value={cabangBaru}
                    onChange={(e) => setCabangBaru(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Antapani">Antapani</option>
                    <option value="Jatinangor">Jatinangor</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Role</label>
                  <select
                    value={roleBaru}
                    onChange={(e) => setRoleBaru(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="staf">Staf</option>
                    <option value="manajer">Manajer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Gaji Pokok (Rp)</label>
                  <input
                    type="number"
                    step="50000"
                    placeholder="1500000"
                    value={gajiBaruInput}
                    onChange={(e) => setGajiBaruInput(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">PIN (4-6 digit)</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="1234"
                    value={pinBaruInput}
                    onChange={(e) => setPinBaruInput(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={addingKaryawan}
                  className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-50"
                >
                  {addingKaryawan ? 'Menambahkan...' : '+ Tambah Karyawan'}
                </button>
              </div>
            </form>

            {/* Daftar Karyawan */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Daftar Karyawan ({daftarKaryawan.length} orang)
              </h2>
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
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 border border-gray-100 rounded-xl bg-gray-50"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">{nama}</p>
                        <p className="text-xs text-gray-500">{cabang}</p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Role</span>
                          <select
                            value={editRoles[k.id] || 'staf'}
                            onChange={(e) =>
                              setEditRoles({ ...editRoles, [k.id]: e.target.value })
                            }
                            className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                          >
                            <option value="staf">Staf</option>
                            <option value="manajer">Manajer</option>
                          </select>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Gaji Pokok (Rp)</span>
                          <input
                            type="number"
                            step="50000"
                            value={editGaji[k.id] || ''}
                            onChange={(e) =>
                              setEditGaji({ ...editGaji, [k.id]: e.target.value })
                            }
                            className="w-32 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">PIN</span>
                          <input
                            type="text"
                            maxLength={6}
                            value={editPins[k.id] || ''}
                            onChange={(e) =>
                              setEditPins({ ...editPins, [k.id]: e.target.value })
                            }
                            className="w-20 p-2 border border-gray-300 rounded-lg text-center text-sm font-mono bg-white"
                          />
                        </div>
                        <button
                          onClick={() => handleUpdateKaryawan(k.id)}
                          className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={() => handleHapusKaryawan(k.id, nama)}
                          className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded-lg"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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