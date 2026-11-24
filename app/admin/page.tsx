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
  no_wa?: string;
  tanggal_lahir?: string;
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

interface IzinSakit {
  id: string;
  karyawan_id: string;
  tanggal: string;
  jenis: string;
  alasan: string;
  foto_bukti?: string | null;
  status: string;
  disetujui_oleh?: string | null;
}

interface PenggajianRecord {
  id: string;
  karyawan_id: string;
  bulan: string;
  gaji_pokok: number;
  bonus: number;
  uang_lembur: number;
  potongan_kasbon: number;
  potongan_telat: number;
  total_gaji: number;
}

interface CurrentUser {
  role: 'owner' | 'manajer';
  id: string;
  nama: string;
}

const OWNER_PIN = '9999';

const PRESET_SHIFT: Record<string, { masuk: string; pulang: string }> = {
  Pagi: { masuk: '07:00', pulang: '16:15' },
  Middle: { masuk: '10:00', pulang: '16:15' },
  Siang: { masuk: '12:00', pulang: '21:15' },
  Full: { masuk: '07:00', pulang: '21:15' },
  Libur: { masuk: '', pulang: '' },
};

// Hitung selisih menit keterlambatan antara jam_masuk absen (ISO) dan jam_masuk jadwal ("HH:MM")
function hitungMenitTelat(jamAbsenIso: string | null, jamJadwal: string | null): number {
  if (!jamAbsenIso || !jamJadwal || !jamJadwal.includes(':')) return 0;
  const [jamJ, menitJ] = jamJadwal.split(':').map(Number);
  if (Number.isNaN(jamJ) || Number.isNaN(menitJ)) return 0;

  const absenDate = new Date(jamAbsenIso);
  const absenMenit = absenDate.getHours() * 60 + absenDate.getMinutes();
  const jadwalMenit = jamJ * 60 + menitJ;

  return Math.max(0, absenMenit - jadwalMenit);
}

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
  const [jadwalHarian, setJadwalHarian] = useState<JadwalShift[]>([]);
  const [absensiBulanan, setAbsensiBulanan] = useState<Absensi[]>([]);
  const [jadwalBulanan, setJadwalBulanan] = useState<JadwalShift[]>([]);
  const [daftarLembur, setDaftarLembur] = useState<Lembur[]>([]);
  const [daftarKasbon, setDaftarKasbon] = useState<Kasbon[]>([]);
  const [daftarIzin, setDaftarIzin] = useState<IzinSakit[]>([]);
  const [riwayatGaji, setRiwayatGaji] = useState<PenggajianRecord[]>([]);
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
  const [noWaBaru, setNoWaBaru] = useState('');
  const [tglLahirBaru, setTglLahirBaru] = useState('');
  const [addingKaryawan, setAddingKaryawan] = useState(false);

  // Edit PIN, Gaji Pokok & Role
  const [editPins, setEditPins] = useState<Record<string, string>>({});
  const [editGaji, setEditGaji] = useState<Record<string, string>>({});
  const [editRoles, setEditRoles] = useState<Record<string, string>>({});
  const [editNoWa, setEditNoWa] = useState<Record<string, string>>({});
  const [editTglLahir, setEditTglLahir] = useState<Record<string, string>>({});
  const [pesanSimpan, setPesanSimpan] = useState('');

  // Pengaturan Hitung Gaji & Deteksi Telat
  const [tarifLemburPerJam, setTarifLemburPerJam] = useState('15000');
  const [toleransiTelatMenit, setToleransiTelatMenit] = useState('10');
  const [dendaPerTelat, setDendaPerTelat] = useState('10000');
  const [bonusAntapani, setBonusAntapani] = useState('0');
  const [bonusJatinangor, setBonusJatinangor] = useState('0');
  const [potonganTelatManual, setPotonganTelatManual] = useState<Record<string, string>>({});
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
      const waMap: Record<string, string> = {};
      const tglLahirMap: Record<string, string> = {};
      data.forEach((k: Karyawan) => {
        pinMap[k.id] = k.pin || '1234';
        gajiMap[k.id] = String(k.gaji_pokok || 0);
        roleMap[k.id] = k.role || 'staf';
      });
      setEditPins(pinMap);
      setEditGaji(gajiMap);
      setEditRoles(roleMap);
      setEditNoWa(waMap);
      setEditTglLahir(tglLahirMap)
    }
  }, []);

  const fetchAbsensi = useCallback(async (tgl: string) => {
    if (!tgl) return;
    setLoading(true);
    const [resAbsen, resJadwal] = await Promise.all([
      supabase
        .from('absensi')
        .select('*')
        .eq('tanggal', tgl)
        .order('jam_masuk', { ascending: true }),
      supabase.from('jadwal_shift').select('*').eq('tanggal', tgl),
    ]);
    if (resAbsen.data) setDaftarAbsensi(resAbsen.data);
    if (resJadwal.data) setJadwalHarian(resJadwal.data);
    setLoading(false);
  }, []);

  const fetchDataBulanan = useCallback(async (bln: string) => {
    if (!bln) return;
    const start = `${bln}-01`;
    const end = `${bln}-31`;
    const [resAbsen, resJadwal] = await Promise.all([
      supabase.from('absensi').select('*').gte('tanggal', start).lte('tanggal', end),
      supabase.from('jadwal_shift').select('*').gte('tanggal', start).lte('tanggal', end),
    ]);
    if (resAbsen.data) setAbsensiBulanan(resAbsen.data);
    if (resJadwal.data) setJadwalBulanan(resJadwal.data);
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
    const [resLembur, resKasbon, resGaji, resIzin] = await Promise.all([
      supabase.from('lembur').select('*').order('tanggal', { ascending: false }),
      supabase.from('kasbon').select('*').order('tanggal', { ascending: false }),
      supabase.from('penggajian').select('*').order('bulan', { ascending: false }),
      supabase.from('izin_sakit').select('*').order('tanggal', { ascending: false }),
    ]);
    if (resLembur.data) setDaftarLembur(resLembur.data);
    if (resKasbon.data) setDaftarKasbon(resKasbon.data);
    if (resGaji.data) setRiwayatGaji(resGaji.data);
    if (resIzin.data) setDaftarIzin(resIzin.data);
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
    if (currentUser && bulanFilter) {
      fetchDataBulanan(bulanFilter);
      setPotonganTelatManual({});
    }
  }, [currentUser, bulanFilter, fetchDataBulanan]);

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

    const sample = daftarKaryawan[0];
    const kolomNama =
      sample && 'nama_lengkap' in sample && !('nama' in sample) ? 'nama_lengkap' : 'nama';
    const kolomCabang =
      sample && 'lokasi_toko' in sample && !('cabang' in sample) ? 'lokasi_toko' : 'cabang';

    const payload: Record<string, unknown> = {
      [kolomNama]: namaBaru.trim(),
      [kolomCabang]: cabangBaru,
      role: roleBaru,
      gaji_pokok: Number(gajiBaruInput || 0),
      pin: pinClean,
      no_wa: noWaBaru.trim() || null,
      tanggal_lahir: tglLahirBaru || null,
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
   .update({
     pin: pinBaru,
     gaji_pokok: gajiBaru,
     role: roleEdit,
     no_wa: editNoWa[karyawanId]?.trim() || null,
     tanggal_lahir: editTglLahir[karyawanId] || null,
   })
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

  const handleStatusIzin = async (id: string, statusBaru: 'Approved' | 'Rejected') => {
    await supabase
      .from('izin_sakit')
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
    
    const handleKirimSlipWA = (
    k: Karyawan,
    slip: {
      gajiPokok: number;
      bonus: number;
      totalJamLembur: number;
      uangLembur: number;
      totalKasbon: number;
      jumlahTelat: number;
      dendaTelat: number;
      totalGaji: number;
    }
  ) => {
    const rawWa = (k.no_wa || '').replace(/\D/g, '');
    if (!rawWa) {
      alert(`Nomor WA untuk ${k.nama || k.nama_lengkap} belum diisi di tab Karyawan & PIN.`);
      return;
    }

    const nomorWa = rawWa.startsWith('0') ? '62' + rawWa.slice(1) : rawWa;
    const nama = k.nama || k.nama_lengkap || 'Karyawan';
    const cabang = k.cabang || k.lokasi_toko || '-';

    const teks = [
      `*SLIP GAJI RUMA BUAH*`,
      `Periode: ${bulanFilter}`,
      `Nama: ${nama} (${cabang})`,
      ``,
      `Gaji Pokok: ${formatRp(slip.gajiPokok)}`,
      `Bonus Cabang: +${formatRp(slip.bonus)}`,
      `Lembur (${slip.totalJamLembur} jam): +${formatRp(slip.uangLembur)}`,
      `Potongan Kasbon: -${formatRp(slip.totalKasbon)}`,
      `Potongan Telat (${slip.jumlahTelat}x): -${formatRp(slip.dendaTelat)}`,
      `---------------------------`,
      `*TOTAL DITERIMA: ${formatRp(slip.totalGaji)}*`,
      ``,
      `Terima kasih atas kerja kerasnya!`,
    ].join('\n');

    window.open(`https://wa.me/${nomorWa}?text=${encodeURIComponent(teks)}`, '_blank');
  };

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

  const toleransiAngka = Number(toleransiTelatMenit || 0);

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

    // Hitung jumlah telat otomatis dalam bulan ini (kecuali Manajer)
    let jumlahTelat = 0;
    if (k.role !== 'manajer') {
      const absenKaryawan = absensiBulanan.filter((a) => a.karyawan_id === k.id);
      absenKaryawan.forEach((a) => {
        const jadwal = jadwalBulanan.find(
          (j) => j.karyawan_id === k.id && j.tanggal === a.tanggal && j.shift !== 'Libur'
        );
        if (jadwal?.jam_masuk) {
          const menitTelat = hitungMenitTelat(a.jam_masuk, jadwal.jam_masuk);
          if (menitTelat > toleransiAngka) {
            jumlahTelat += 1;
          }
        }
      });
    }

    const dendaOtomatis = jumlahTelat * Number(dendaPerTelat || 0);
    const hasManualOverride =
      potonganTelatManual[k.id] !== undefined && potonganTelatManual[k.id] !== '';
    const dendaTelat = hasManualOverride ? Number(potonganTelatManual[k.id]) : dendaOtomatis;

    const totalGaji = gajiPokok + bonus + uangLembur - totalKasbon - dendaTelat;

    return {
      gajiPokok,
      bonus,
      totalJamLembur,
      uangLembur,
      totalKasbon,
      jumlahTelat,
      dendaOtomatis,
      dendaTelat,
      totalGaji,
    };
  };

  const handleSimpanPenggajian = async () => {
    if (!bulanFilter) return;
    setSavingGaji(true);
    setPesanSimpan('');

    await supabase.from('penggajian').delete().eq('bulan', bulanFilter);

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
      fetchPengajuan();
    }
    setSavingGaji(false);
  };

  const rekapPerBulan = Object.values(
    riwayatGaji.reduce(
      (acc, row) => {
        const bln = row.bulan || 'Tanpa Bulan';
        if (!acc[bln]) {
          acc[bln] = {
            bulan: bln,
            jumlahKaryawan: 0,
            totalPokok: 0,
            totalBonus: 0,
            totalLembur: 0,
            totalPotongan: 0,
            grandTotal: 0,
          };
        }
        acc[bln].jumlahKaryawan += 1;
        acc[bln].totalPokok += Number(row.gaji_pokok || 0);
        acc[bln].totalBonus += Number(row.bonus || 0);
        acc[bln].totalLembur += Number(row.uang_lembur || 0);
        acc[bln].totalPotongan +=
          Number(row.potongan_kasbon || 0) + Number(row.potongan_telat || 0);
        acc[bln].grandTotal += Number(row.total_gaji || 0);
        return acc;
      },
      {} as Record<
        string,
        {
          bulan: string;
          jumlahKaryawan: number;
          totalPokok: number;
          totalBonus: number;
          totalLembur: number;
          totalPotongan: number;
          grandTotal: number;
        }
      >
    )
  ).sort((a, b) => b.bulan.localeCompare(a.bulan));

  const pendingCount =
    daftarLembur.filter((l) => l.status === 'Pending').length +
    daftarKasbon.filter((k) => k.status === 'Pending').length +
    daftarIzin.filter((i) => i.status === 'Pending').length;

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
        { id: 'gaji', label: 'Penggajian' },
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
                      <th className="py-3 px-2">Jadwal</th>
                      <th className="py-3 px-2">Masuk</th>
                      <th className="py-3 px-2">Pulang</th>
                      <th className="py-3 px-2">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karyawanFiltered.map((k) => {
                      const absen = daftarAbsensi.find((a) => a.karyawan_id === k.id);
                      const jadwal = jadwalHarian.find((j) => j.karyawan_id === k.id);
                      const izinHariIni = daftarIzin.find(
                        (i) =>
                          i.karyawan_id === k.id &&
                          i.tanggal === tanggalFilter &&
                          i.status === 'Approved'
                      );
                      const nama = k.nama || k.nama_lengkap || 'Tanpa Nama';
                      const cabang = k.cabang || k.lokasi_toko || '-';

                      const menitTelat =
                        k.role !== 'manajer' && jadwal && jadwal.shift !== 'Libur'
                          ? hitungMenitTelat(absen?.jam_masuk || null, jadwal.jam_masuk)
                          : 0;
                      const isTelat = menitTelat > toleransiAngka;

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
                          <td className="py-3 px-2 text-xs text-gray-500">
                            {k.role === 'manajer'
                              ? 'Fleksibel'
                              : jadwal
                              ? jadwal.shift === 'Libur'
                                ? 'Libur'
                                : `${jadwal.shift} (${jadwal.jam_masuk})`
                              : '-'}
                          </td>
                          <td className="py-3 px-2">
                            {absen?.jam_masuk ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-1 rounded-lg font-medium ${
                                    isTelat
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-green-100 text-green-800'
                                  }`}
                                >
                                  {formatJam(absen.jam_masuk)}
                                </span>
                                {isTelat && (
                                  <span className="text-xs font-bold text-red-600">
                                    Telat {menitTelat}m
                                  </span>
                                )}
                              </div>
                            ) : izinHariIni ? (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg font-medium">
                                {izinHariIni.jenis}
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
                        <option value="Pagi">Shift Pagi (07:00 - 16:15)</option>
                        <option value="Middle">Shift Middle (10:00 - 16:15)</option>
                        <option value="Siang">Shift Siang (12:00 - 21:15)</option>
                        <option value="Full">Shift Full (07:00 - 21:15)</option>
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

        {/* TAB 3: APPROVAL LEMBUR, KASBON & IZIN/SAKIT */}
        {activeTab === 'approval' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lembur */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Lembur</h2>
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

            {/* Kasbon */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Kasbon</h2>
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

            {/* Izin / Sakit */}
            <div className="bg-white p-5 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Izin / Sakit</h2>
                <button
                  onClick={fetchPengajuan}
                  className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-lg font-semibold"
                >
                  Refresh
                </button>
              </div>
              {daftarIzin.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Belum ada pengajuan izin/sakit.</p>
              ) : (
                <div className="space-y-3">
                  {daftarIzin.map((iz) => {
                    const isSelfRequest =
                      currentUser.role === 'manajer' && iz.karyawan_id === currentUser.id;

                    return (
                      <div key={iz.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-gray-800">{getNamaKaryawan(iz.karyawan_id)}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              iz.status === 'Approved'
                                ? 'bg-green-100 text-green-800'
                                : iz.status === 'Rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {iz.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {iz.tanggal} • <strong className="text-blue-700">{iz.jenis}</strong>
                        </p>
                        <p className="text-gray-700 mt-1">{iz.alasan}</p>
                        {iz.foto_bukti && (
                          <button
                            onClick={() => setFotoModal(iz.foto_bukti || null)}
                            className="mt-2 text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-semibold"
                          >
                            Lihat Foto Bukti
                          </button>
                        )}
                        {iz.disetujui_oleh && (
                          <p className="text-xs text-gray-400 mt-1">
                            Diproses oleh: {iz.disetujui_oleh}
                          </p>
                        )}
                        {iz.status === 'Pending' &&
                          (isSelfRequest ? (
                            <p className="mt-2 text-xs italic text-amber-700">
                              Pengajuan pribadi hanya bisa disetujui oleh Owner.
                            </p>
                          ) : (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleStatusIzin(iz.id, 'Approved')}
                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold"
                              >
                                Setujui
                              </button>
                              <button
                                onClick={() => handleStatusIzin(iz.id, 'Rejected')}
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
        {activeTab === 'gaji' && (() => {
          const semuaSlip = daftarKaryawan.map((k) => ({
            karyawan: k,
            cabang: (k.cabang || k.lokasi_toko || '').toLowerCase(),
            ...hitungSlipKaryawan(k),
          }));

          const totalSemua = semuaSlip.reduce((acc, s) => acc + s.totalGaji, 0);
          const totalAntapani = semuaSlip
            .filter((s) => s.cabang.includes('antapani'))
            .reduce((acc, s) => acc + s.totalGaji, 0);
          const totalJatinangor = semuaSlip
            .filter((s) => s.cabang.includes('jatinangor'))
            .reduce((acc, s) => acc + s.totalGaji, 0);

          return (
            <div className="space-y-6">
              {/* Kartu Ringkasan Total Gaji Bulan Ini */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-green-700">
                  <p className="text-xs text-gray-500">Total Pengeluaran Gaji ({bulanFilter})</p>
                  <p className="text-xl font-bold text-green-800 mt-1">{formatRp(totalSemua)}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-emerald-500">
                  <p className="text-xs text-gray-500">Total Cabang Antapani</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatRp(totalAntapani)}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-teal-500">
                  <p className="text-xs text-gray-500">Total Cabang Jatinangor</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatRp(totalJatinangor)}</p>
                </div>
              </div>

              {/* Kalkulator & Tabel Gaji Bulan Dipilih */}
              <div className="bg-white p-5 rounded-2xl shadow-sm space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-green-50 p-4 rounded-xl">
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
                      Lembur / Jam (Rp)
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
                      Toleransi (Menit)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={toleransiTelatMenit}
                      onChange={(e) => setToleransiTelatMenit(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Denda / Telat (Rp)
                    </label>
                    <input
                      type="number"
                      step="5000"
                      min="0"
                      value={dendaPerTelat}
                      onChange={(e) => setDendaPerTelat(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Bonus Antapani ({jumlahAntapani})
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
                      Bonus Jatinangor ({jumlahJatinangor})
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
                        <th className="py-3 px-2 text-center">Slip WA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semuaSlip.map((slip) => {
                        const k = slip.karyawan;
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
                                value={
                                  potonganTelatManual[k.id] !== undefined
                                    ? potonganTelatManual[k.id]
                                    : String(slip.dendaOtomatis)
                                }
                                onChange={(e) =>
                                  setPotonganTelatManual({
                                    ...potonganTelatManual,
                                    [k.id]: e.target.value,
                                  })
                                }
                                className="w-24 p-1.5 border border-gray-300 rounded-lg text-sm"
                              />
                              <span className="block text-xs text-gray-400 mt-0.5">
                                {slip.jumlahTelat > 0
                                  ? `${slip.jumlahTelat}x telat otomatis`
                                  : '0x telat'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-green-800">
                              {formatRp(slip.totalGaji)}
                            </td>
                            <td className="py-3 px-2 text-center">
                           <button
                             onClick={() => handleKirimSlipWA(k, slip)}
                             disabled={!k.no_wa}
                             className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                               k.no_wa
                                 ? 'bg-green-600 hover:bg-green-700 text-white'
                                 : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                             }`}
                           >
                             {k.no_wa ? 'Kirim WA' : 'No WA Kosong'}
                           </button>
                         </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 font-bold text-green-900">
                        <td className="py-3 px-2">TOTAL</td>
                        <td className="py-3 px-2">
                          {formatRp(semuaSlip.reduce((a, s) => a + s.gajiPokok, 0))}
                        </td>
                        <td className="py-3 px-2">
                          {formatRp(semuaSlip.reduce((a, s) => a + s.bonus, 0))}
                        </td>
                        <td className="py-3 px-2">
                          {formatRp(semuaSlip.reduce((a, s) => a + s.uangLembur, 0))}
                        </td>
                        <td className="py-3 px-2 text-red-700">
                          -{formatRp(semuaSlip.reduce((a, s) => a + s.totalKasbon, 0))}
                        </td>
                        <td className="py-3 px-2 text-red-700">
                          -{formatRp(semuaSlip.reduce((a, s) => a + s.dendaTelat, 0))}
                        </td>
                        <td className="py-3 px-2 text-right text-base">{formatRp(totalSemua)}</td>
                      <td className="py-3 px-2"></td>
                      </tr>
 
                    </tfoot>
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

              {/* Riwayat Rekap Total Gaji Per Bulan */}
              <div className="bg-white p-5 rounded-2xl shadow-sm">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  Riwayat Rekap Total Gaji per Bulan
                </h2>
                {rekapPerBulan.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">
                    Belum ada rekap gaji yang disimpan. Klik tombol &quot;Simpan Rekap Gaji&quot; di atas.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-600">
                          <th className="py-3 px-2">Bulan</th>
                          <th className="py-3 px-2">Karyawan</th>
                          <th className="py-3 px-2">Gaji Pokok</th>
                          <th className="py-3 px-2">Bonus + Lembur</th>
                          <th className="py-3 px-2">Total Potongan</th>
                          <th className="py-3 px-2 text-right">Total Gaji Dibayar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekapPerBulan.map((r) => (
                          <tr key={r.bulan} className="border-b border-gray-100 hover:bg-green-50/50">
                            <td className="py-3 px-2 font-bold text-gray-800">{r.bulan}</td>
                            <td className="py-3 px-2 text-gray-600">{r.jumlahKaryawan} org</td>
                            <td className="py-3 px-2">{formatRp(r.totalPokok)}</td>
                            <td className="py-3 px-2 text-green-700">
                              +{formatRp(r.totalBonus + r.totalLembur)}
                            </td>
                            <td className="py-3 px-2 text-red-600">
                              -{formatRp(r.totalPotongan)}
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-green-800">
                              {formatRp(r.grandTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* TAB 5: TAMBAH & KELOLA KARYAWAN (Khusus Owner) */}
        {isOwner && activeTab === 'karyawan' && (
          <div className="space-y-6">
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
               <label className="text-xs text-gray-500 block mb-1">No. WA</label>
               <input
                 type="tel"
                 placeholder="081234567890"
                 value={noWaBaru}
                 onChange={(e) => setNoWaBaru(e.target.value)}
                 className="w-full p-2 border border-gray-300 rounded-lg text-sm"
               />
             </div>
             <div>
               <label className="text-xs text-gray-500 block mb-1">Tanggal Lahir</label>
               <input
                 type="date"
                 value={tglLahirBaru}
                 onChange={(e) => setTglLahirBaru(e.target.value)}
                 className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
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
                        <div>
                       <span className="text-xs text-gray-500 block mb-1">No. WA</span>
                       <input
                         type="tel"
                         placeholder="08..."
                         value={editNoWa[k.id] || ''}
                         onChange={(e) =>
                           setEditNoWa({ ...editNoWa, [k.id]: e.target.value })
                         }
                         className="w-32 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                       />
                     </div>
                     <div>
                       <span className="text-xs text-gray-500 block mb-1">Tgl Lahir</span>
                       <input
                         type="date"
                         value={editTglLahir[k.id] || ''}
                         onChange={(e) =>
                           setEditTglLahir({ ...editTglLahir, [k.id]: e.target.value })
                         }
                         className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
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