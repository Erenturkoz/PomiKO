/**
 * Ana sayfa içeriği.
 * ŞİMDİLİK burada sabit duruyor; bir sonraki adımda admin panelinden
 * yönetilebilir hale gelecek (bu dosyadaki diziler API'den gelecek).
 */

export interface Feature {
  title: string;
  text: string;
  color: string;
}

export interface AgeTrack {
  age: string;
  title: string;
  text: string;
  color: string;
}

export interface Level {
  name: string;
  age: string;
  meta: string;
  text: string;
}

export interface Step {
  n: number;
  title: string;
  text: string;
}

export interface Teacher {
  name: string;
  title: string;
  bio: string;
  color: string;
  photoUrl?: string;
}

export interface Plan {
  name: string;
  items: string[];
  featured?: boolean;
}

export interface Faq {
  q: string;
  a: string;
}

export const HERO_BULLETS: Feature[] = [
  { title: 'Canlı ve interaktif dersler', text: '', color: '#4dabf7' },
  { title: 'Çocuklara özel öğretim yöntemi', text: '', color: '#51cf66' },
  { title: 'Güvenli online sınıf', text: '', color: '#9775fa' },
  { title: 'Düzenli gelişim takibi', text: '', color: '#e6b800' },
  { title: 'Yaşa ve seviyeye uygun program', text: '', color: '#ff8787' },
];

export const FEATURES: Feature[] = [
  {
    title: 'Canlı ve Etkileşimli Dersler',
    text: 'Çocukların yalnızca dinlemediği, konuşarak ve uygulayarak öğrendiği dersler.',
    color: '#4dabf7',
  },
  {
    title: 'Oyunlaştırılmış Öğrenme',
    text: 'Yıldızlar, görevler, seviyeler ve mini quizlerle desteklenen öğrenme deneyimi.',
    color: '#e6b800',
  },
  {
    title: 'Çocuğa Özel Program',
    text: 'Yaşa, seviyeye, ilgi alanlarına ve öğrenme hızına göre şekillenen içerikler.',
    color: '#9775fa',
  },
  {
    title: 'Düzenli Veli Bilgilendirmesi',
    text: 'Ders sonrası değerlendirmeler ve gelişim raporlarıyla süreci birlikte takip edersiniz.',
    color: '#51cf66',
  },
  {
    title: 'Deneyimli Öğretmenler',
    text: 'Alanında uzman, iletişimi güçlü ve çocuklara uygun öğretmenlerle çalışıyoruz.',
    color: '#ff922b',
  },
  {
    title: 'Güvenli Dijital Ortam',
    text: 'Çocuklar yalnızca öğretmeni ve eğitim içerikleriyle etkileşime giren kontrollü bir sistemde öğrenir.',
    color: '#f06595',
  },
];

export const AGE_TRACKS: AgeTrack[] = [
  {
    age: '6–8 yaş',
    title: 'Keşif Zamanı',
    text: 'Oyun, görsel kartlar, şarkılar ve temel kelimelerle ilk adımlar.',
    color: '#a5d8ff',
  },
  {
    age: '9–12 yaş',
    title: 'Konuşma Cesareti',
    text: 'Günlük konuşma kalıpları, kısa hikâyeler ve eğlenceli görevler.',
    color: '#b2f2bb',
  },
  {
    age: '13–16 yaş',
    title: 'Akademik Gelişim',
    text: 'Konuşma pratiği, sınav odaklı çalışma ve okul derslerine destek.',
    color: '#d0bfff',
  },
];

export const LEVELS: Level[] = [
  { name: 'Başlangıç', age: '6+ yaş', meta: '45 dk · Grup / Birebir', text: 'Temel kelimeler, sesler ve ilk cümle kalıpları.' },
  { name: 'A1', age: '7+ yaş', meta: '45 dk · Grup / Birebir', text: 'Basit tanışma, günlük ihtiyaçları ifade etme.' },
  { name: 'A2', age: '9+ yaş', meta: '50 dk · Grup / Birebir', text: 'Günlük konuşmalar, kısa metin okuma ve yazma.' },
  { name: 'B1', age: '11+ yaş', meta: '50 dk · Birebir', text: 'Akıcı konuşma, fikir belirtme, okul destek uyumu.' },
  { name: 'Konuşma Kulübü', age: '9–16 yaş', meta: '40 dk · Küçük Grup', text: 'Serbest konuşma ortamında özgüven kazanımı.' },
  { name: 'Okul Destek Programı', age: '10–16 yaş', meta: '50 dk · Birebir', text: 'Okul müfredatına paralel ödev ve sınav desteği.' },
];

export const STEPS: Step[] = [
  { n: 1, title: 'Ücretsiz deneme dersine başvur', text: 'Birkaç dakikada formu doldurun.' },
  { n: 2, title: 'Yaş ve seviye belirlensin', text: 'Kısa bir görüşmeyle uygun seviyeyi bulalım.' },
  { n: 3, title: 'Öğretmen ve programla eşleş', text: 'Çocuğunuza en uygun öğretmeni seçelim.' },
  { n: 4, title: 'Öğrenme yolculuğu başlasın', text: 'Lumiko dünyasında keşfe çıkın.' },
];

export const TEACHERS: Teacher[] = [
  {
    name: 'Elif Aydın',
    title: 'Çocuk Almancası Uzmanı',
    bio: '6-10 yaş grubuyla 5 yıllık deneyim, oyun tabanlı öğretim yaklaşımı.',
    color: '#a5d8ff',
  },
  {
    name: 'Mert Kaya',
    title: 'Konuşma & Telaffuz Koçu',
    bio: "Almanya'da eğitim gördü, konuşma cesareti kazandırmaya odaklanır.",
    color: '#b2f2bb',
  },
  {
    name: 'Zeynep Polat',
    title: 'Okul Destek Programı',
    bio: 'Sınav hazırlığı ve akademik Almanca konusunda uzmanlaşmış öğretmen.',
    color: '#d0bfff',
  },
];

export const EVAL_BARS: { label: string; pct: number; color: string }[] = [
  { label: 'Derse Katılım', pct: 92, color: '#51cf66' },
  { label: 'Kelime Bilgisi', pct: 80, color: '#4dabf7' },
  { label: 'Telaffuz', pct: 72, color: '#4dabf7' },
  { label: 'Dinlediğini Anlama', pct: 86, color: '#51cf66' },
  { label: 'Motivasyon', pct: 95, color: '#e6b800' },
];

export const PLANS: Plan[] = [
  {
    name: 'Başlangıç Paketi',
    items: ['Ayda 4 canlı ders', 'Küçük grup dersleri', 'Mini quizler', 'Ders sonu değerlendirme'],
  },
  {
    name: 'Gelişim Paketi',
    items: [
      'Ayda 8 canlı ders',
      'Birebir + grup seçeneği',
      'Dijital etkinlikler',
      'Aylık veli raporu',
      'Konuşma kulübü erişimi',
    ],
    featured: true,
  },
  {
    name: 'Lumiko Plus',
    items: [
      'Ayda 12 canlı ders',
      'Tamamen birebir',
      'Ek çalışma materyalleri',
      'Haftalık veli raporu',
      'Öncelikli öğretmen desteği',
    ],
  },
];

export const FAQS: Faq[] = [
  {
    q: 'Dersler nasıl işleniyor?',
    a: 'Dersler canlı görüntülü olarak, öğretmen ve çocuğun aynı materyal üzerinde birlikte çalışabildiği özel bir sınıf ekranında yapılır.',
  },
  {
    q: 'Çocuğumun seviyesini nasıl belirliyorsunuz?',
    a: 'Ücretsiz deneme dersinde kısa bir tanışma ve seviye sohbetiyle çocuğunuza en uygun programı birlikte belirliyoruz.',
  },
  {
    q: 'Dersi iptal edebilir miyim?',
    a: 'Ders başlangıcına 30 dakikadan fazla varsa dersinizi iptal edebilirsiniz; kredi hesabınıza iade edilir.',
  },
  {
    q: 'Çocuğumun güvenliği nasıl sağlanıyor?',
    a: 'Çocuklar yalnızca öğretmeniyle ve eğitim içerikleriyle etkileşime girer. Sınıf ortamı kapalıdır ve veli hesabı üzerinden yönetilir.',
  },
];
