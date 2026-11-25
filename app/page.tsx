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

interface JadwalShift {
  id: string;
  tanggal: string;
  shift: string;
  jam_masuk: string;
  jam_pulang: string;
}

const LOKASI_TOKO = {
  antapani: {
    nama: 'Ruma Buah Antapani',
    lat: -6.917160652418372,
    lng: 107.6614519441786,
  },
  jatinangor: {
    nama: 'Ruma Buah Jatinangor',
    lat: -6.937227239864906,
    lng: 107.76018732270263,
  },
};

const RADIUS_MAKSIMAL_METER = 50;

function hitungJarakMeter(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function HalamanKaryawan() {
  const [activeTab, setActiveTab] = useState<'absen' | 'izin' | 'lembur' | 'kasbon'>('absen');
  const [daftarKaryawan, setDaftarKaryawan] = useState<Karyawan[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [tanggalHariIni, setTanggalHariIni] = useState('');
  const [tanggalTampil, setTanggalTampil] = useState('');

  // State Jadwal & Absen
  const [jadwalKaryawan, setJadwalKaryawan] = useState<JadwalShift[]>([]);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [absenHariIni, setAbsenHariIni] = useState<AbsensiHariIni | null>(null);
  const [checking, setChecking] = useState(false);

  // State Izin / Sakit
  const [tanggalIzin, setTanggalIzin] = useState('');
  const [jenisIzin, setJenisIzin] = useState<'Sakit' | 'Izin'>('Sakit');
  const [alasanIzin, setAlasanIzin] = useState('');
  const [fotoIzinFile, setFotoIzinFile] = useState<File | null>(null);

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
    setTanggalIzin(todayStr);
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
      setJadwalKaryawan([]);
      return;
    }

    const cekDataKaryawan = async () => {
      setChecking(true);

      const [resAbsen, resJadwal] = await Promise.all([
        supabase
          .from('absensi')
          .select('*')
          .eq('karyawan_id', selectedId)
          .eq('tanggal', tanggalHariIni)
          .maybeSingle(),
        supabase
          .from('jadwal_shift')
          .select('*')
          .eq('karyawan_id', selectedId)
          .gte('tanggal', tanggalHariIni)
          .order('tanggal', { ascending: true })
          .limit(5),
      ]);

      if (resAbsen.error) {
        setPesan('❌ Gagal cek absensi: ' + resAbsen.error.message);
      } else {
        setAbsenHariIni(resAbsen.data);
      }

      if (resJadwal.data) {
        setJadwalKaryawan(resJadwal.data);
      }

      setChecking(false);
    };

    cekDataKaryawan();
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

  const validasiLokasiGPS = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setPesan('❌ Browser HP Anda tidak mendukung GPS.');
        resolve(false);
        return;
      }

      setPesan('📍 Mengecek lokasi GPS Anda...');

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;

          const karyawan = daftarKaryawan.find((k) => k.id === selectedId);
          const cabangText = (karyawan?.cabang || karyawan?.lokasi_toko || '').toLowerCase();

          let targetToko = null;
          if (cabangText.includes('antapani')) {
            targetToko = LOKASI_TOKO.antapani;
          } else if (cabangText.includes('jatinangor')) {
            targetToko = LOKASI_TOKO.jatinangor;
          }

          if (targetToko) {
            const jarak = Math.round(
              hitungJarakMeter(userLat, userLng, targetToko.lat, targetToko.lng)
            );
            if (jarak > RADIUS_MAKSIMAL_METER) {
              setPesan(
                `❌ Anda berada ${jarak}m dari ${targetToko.nama}. Maksimal radius absen adalah ${RADIUS_MAKSIMAL_METER}m.`
              );
              resolve(false);
              return;
            }
            resolve(true);
          } else {
            const jarakAntapani = Math.round(
              hitungJarakMeter(userLat, userLng, LOKASI_TOKO.antapani.lat, LOKASI_TOKO.antapani.lng)
            );
            const jarakJatinangor = Math.round(
              hitungJarakMeter(userLat, userLng, LOKASI_TOKO.jatinangor.lat, LOKASI_TOKO.jatinangor.lng)
            );
            const jarakTerdekat = Math.min(jarakAntapani, jarakJatinangor);

            if (jarakTerdekat > RADIUS_MAKSIMAL_METER) {
              setPesan(
                `❌ Anda berada ${jarakTerdekat}m dari toko terdekat. Maksimal radius absen adalah ${RADIUS_MAKSIMAL_METER}m.`
              );
              resolve(false);
              return;
            }
            resolve(true);
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPesan('❌ Izin lokasi (GPS) ditolak. Aktifkan izin lokasi di browser HP Anda.');
          } else {
            setPesan('❌ Gagal mendapatkan lokasi GPS. Pastikan GPS HP aktif dan sinyal stabil.');
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

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
    const lokasiValid = await validasiLokasiGPS();
    if (!lokasiValid) {
      setLoading(false);
      return;
    }

    setPesan('Mengupload foto & mencatat absen...');
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
    const lokasiValid = await validasiLokasiGPS();
    if (!lokasiValid) {
      setLoading(false);
      return;
    }

    setPesan('Mengupload foto & mencatat absen...');
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

  const kirimNotifTelegram = async (teks: string) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pesan: teks }),
      });
    } catch {
      // Abaikan jika notif gagal agar pengajuan karyawan tetap tersimpan
    }
  };

  const getInfoKaryawanDipilih = () => {
    const k = daftarKaryawan.find((item) => item.id === selectedId);
    const nama = k?.nama || k?.nama_lengkap || 'Karyawan';
    const cabang = k?.cabang || k?.lokasi_toko || '-';
    return `${nama} (${cabang})`;
  };

// <-- Tempelkan kirimNotifTelegram & getInfoKaryawanDipilih DI SINI
  
  const handleAjukanIzin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validasiPin()) return;
    if (!alasanIzin.trim()) {
      setPesan('❌ Keterangan / alasan wajib diisi.');
      return;
    }

    setLoading(true);
    setPesan('');
    try {
      let fotoUrl: string | null = null;
      if (fotoIzinFile) {
        const ext = fotoIzinFile.name.split('.').pop() || 'jpg';
        const fileName = `izin/${tanggalIzin || tanggalHariIni}/${selectedId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('foto-absensi')
          .upload(fileName, fotoIzinFile);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('foto-absensi').getPublicUrl(fileName);
        fotoUrl = data.publicUrl;
      }

      const { error } = await supabase.from('izin_sakit').insert([
        {
          karyawan_id: selectedId,
          tanggal: tanggalIzin || tanggalHariIni,
          jenis: jenisIzin,
          alasan: alasanIzin.trim(),
          foto_bukti: fotoUrl,
          status: 'Pending',
        },
      ]);

      if (error) throw error;
      await kirimNotifTelegram(
     `📋 <b>PENGAJUAN ${jenisIzin.toUpperCase()}</b>\n` +
     `Nama: ${getInfoKaryawanDipilih()}\n` +
     `Tanggal: ${tanggalIzin || tanggalHariIni}\n` +
     `Alasan: ${alasanIzin.trim()}`
   );
      setAlasanIzin('');
      setFotoIzinFile(null);
      setPinInput('');
      setPesan(`✅ Pengajuan ${jenisIzin} terkirim! Menunggu persetujuan Manajer/Owner.`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal mengajukan izin/sakit: ' + msg);
    } finally {
      setLoading(false);
    }

  };

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
      await kirimNotifTelegram(
     `⏰ <b>PENGAJUAN LEMBUR</b>\n` +
     `Nama: ${getInfoKaryawanDipilih()}\n` +
     `Tanggal: ${tanggalLembur || tanggalHariIni}\n` +
     `Durasi: ${durasiJam} jam\n` +
     `Alasan: ${alasanLembur.trim()}`
   );
      setDurasiJam('');
      setAlasanLembur('');
      setPinInput('');
      setPesan('✅ Pengajuan lembur terkirim! Menunggu persetujuan Manajer/Owner.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setPesan('❌ Gagal mengajukan lembur: ' + msg);
    } finally {
      setLoading(false);
    }
  };

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
          jumlah: nominalAngka,
          keperluan: keperluanKasbon.trim(),
          keterangan: keperluanKasbon.trim(),
          status: 'Pending',
        },
      ]);

      if (error) throw error;
      await kirimNotifTelegram(
     `💸 <b>PENGAJUAN KASBON</b>\n` +
     `Nama: ${getInfoKaryawanDipilih()}\n` +
     `Nominal: Rp ${nominalAngka.toLocaleString('id-ID')}\n` +
     `Keperluan: ${keperluanKasbon.trim()}`
   );
      setNominalKasbon('');
      setKeperluanKasbon('');
      setPinInput('');
      setPesan('✅ Pengajuan kasbon terkirim! Menunggu persetujuan Manajer/Owner.');
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message || JSON.stringify(error);
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

  const formatTanggalSingkat = (tglStr: string) => {
    const [y, m, d] = tglStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const butuhAbsen = selectedId && (!absenHariIni || !absenHariIni.jam_pulang);

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-lg max-w-sm w-full text-center border-t-4 border-green-600">
        <h1 className="text-2xl font-bold text-green-800 mb-1">Ruma Buah HRIS</h1>
        <p className="text-sm text-gray-500 mb-5 min-h-[20px]">{tanggalTampil}</p>

        {/* Tab Navigasi */}
        <div className="grid grid-cols-4 gap-1 bg-green-50 p-1 rounded-xl mb-5">
          {(['absen', 'izin', 'lembur', 'kasbon'] as const).map((tab) => (
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

          {/* Info Jadwal Shift Mendatang */}
          {selectedId && jadwalKaryawan.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-900 space-y-1.5">
              <p className="font-bold text-green-800">Jadwal Shift Anda:</p>
              {jadwalKaryawan.map((j) => (
                <div
                  key={j.id}
                  className="flex justify-between items-center border-t border-green-100 pt-1"
                >
                  <span className="font-medium">
                    {formatTanggalSingkat(j.tanggal)}
                    {j.tanggal === tanggalHariIni ? ' (Hari ini)' : ''}
                  </span>
                  {j.shift === 'Libur' ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold">
                      Libur
                    </span>
                  ) : (
                    <span className="font-semibold">
                      {j.shift} ({j.jam_masuk} - {j.jam_pulang})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
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

                <p className="text-xs text-gray-400 text-center">
                  📍 Wajib berada dalam radius {RADIUS_MAKSIMAL_METER}m dari toko
                </p>
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
                {loading ? 'Memproses...' : 'Absen Masuk Sekarang'}
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
                  {loading ? 'Memproses...' : 'Absen Pulang Sekarang'}
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

        {/* TAB 2: IZIN / SAKIT */}
        {activeTab === 'izin' && (
          <form onSubmit={handleAjukanIzin} className="space-y-4 text-left">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Jenis
                </label>
                <select
                  value={jenisIzin}
                  onChange={(e) => setJenisIzin(e.target.value as 'Sakit' | 'Izin')}
                  className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
                >
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={tanggalIzin}
                  onChange={(e) => setTanggalIzin(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Alasan / Keterangan
              </label>
              <textarea
                rows={2}
                placeholder="Contoh: Demam / Ada urusan keluarga"
                value={alasanIzin}
                onChange={(e) => setAlasanIzin(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-gray-800 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Foto Surat Dokter / Bukti (Opsional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFotoIzinFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-100 file:text-green-800 hover:file:bg-green-200"
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
              {loading ? 'Mengirim...' : `Ajukan ${jenisIzin}`}
            </button>
          </form>
        )}

        {/* TAB 3: LEMBUR */}
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

        {/* TAB 4: KASBON */}
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