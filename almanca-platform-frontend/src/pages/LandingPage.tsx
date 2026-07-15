import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../api/client';
import { Reveal, ScrollProgress, CountUp } from '../components/Reveal';
import {
  HERO_BULLETS,
  FEATURES,
  AGE_TRACKS,
  LEVELS,
  STEPS,
  TEACHERS,
  EVAL_BARS,
  PLANS,
  FAQS,
} from './landing.data';

const NAV_LINKS = [
  { label: 'Ana Sayfa', href: '#top' },
  { label: 'Eğitimler', href: '#levels' },
  { label: 'Nasıl Çalışır?', href: '#how' },
  { label: 'Öğretmenlerimiz', href: '#teachers' },
  { label: 'Üyelikler', href: '#plans' },
  { label: 'Hakkımızda', href: '#why' },
  { label: 'Sık Sorulan Sorular', href: '#faq' },
];

function Brand() {
  const [err, setErr] = useState(false);
  return (
    <div className="lp-brand">
      {err ? (
        <>
          <span className="lp-brand-mark">★</span>
          <span className="lp-brand-text">Lumiko</span>
        </>
      ) : (
        // Logo görselinde zaten "Lumiko" yazıyor — yanına ayrıca yazı koymuyoruz
        <img src="/lumiko-logo.png" alt="Lumiko" className="lp-brand-logo" onError={() => setErr(true)} />
      )}
    </div>
  );
}

interface HomeTeacher {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
}
interface HomeTestimonial {
  id: string;
  name: string;
  role: string | null;
  text: string;
  rating: number;
}

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Admin panelinden yönetilen içerik (yoksa varsayılanlar kullanılır)
  const [heroTitle, setHeroTitle] = useState<string | null>(null);
  const [heroText, setHeroText] = useState<string | null>(null);
  const [cmsTeachers, setCmsTeachers] = useState<HomeTeacher[]>([]);
  const [testimonials, setTestimonials] = useState<HomeTestimonial[]>([]);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/site/home`);
        if (!res.ok) return;
        const data = await res.json();
        if (off) return;
        if (data?.content?.hero?.title) setHeroTitle(data.content.hero.title);
        if (data?.content?.hero?.text) setHeroText(data.content.hero.text);
        if (Array.isArray(data?.teachers)) setCmsTeachers(data.teachers);
        if (Array.isArray(data?.testimonials)) setTestimonials(data.testimonials);
      } catch {
        /* içerik alınamazsa varsayılanlar gösterilir */
      }
    })();
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp" id="top">
      <ScrollProgress />

      {/* ---------- Üst menü ---------- */}
      <div className={`lp-nav-shell ${scrolled ? 'is-stuck' : ''}`}>
        <header className={`lp-nav ${scrolled ? 'is-stuck' : ''}`}>
          <div className="lp-nav-inner">
            <Brand />
            <nav className="lp-nav-links">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="lp-nav-cta">
              <Link to="/login" className="lp-link">
                Giriş Yap
              </Link>
              <Link to="/register" className="lp-btn lp-btn-primary">
                Ücretsiz Deneme Dersi
              </Link>
            </div>
          </div>
        </header>
      </div>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <span className="lp-blob lp-blob-1" />
        <span className="lp-blob lp-blob-2" />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <Reveal variant="up">
              <span className="lp-pill">
                <i className="lp-dot" /> Çocuklar için canlı Almanca dersleri
              </span>
            </Reveal>
            <Reveal variant="up" delay={80}>
              <h1 className="lp-h1">
                {heroTitle ?? 'Çocuklar İçin Eğlenceli ve Etkili Online Almanca Dersleri'}
              </h1>
            </Reveal>
            <Reveal variant="up" delay={160}>
              <p className="lp-lead">
                {heroText ??
                  "Canlı dersler, oyunlaştırılmış etkinlikler ve çocuğunuzun gelişimine özel öğrenme yolculuğu Lumiko'da bir araya geliyor."}
              </p>
            </Reveal>
            <Reveal variant="up" delay={240}>
              <div className="lp-hero-actions">
                <Link to="/register" className="lp-btn lp-btn-primary lp-btn-lg">
                  Ücretsiz Deneme Dersi Al
                </Link>
                <a href="#why" className="lp-btn lp-btn-white lp-btn-lg">
                  Lumiko'yu Keşfet
                </a>
              </div>
            </Reveal>
          </div>

          {/* Yüzen kartlar */}
          <div className="lp-hero-art">
            <Reveal variant="zoom" delay={120}>
              <div className="lp-card lp-card-class">
                <div className="lp-card-head">
                  <span className="lp-card-title">Canlı Ders · Hayvanlar</span>
                  <span className="lp-chip lp-chip-live">Aktif</span>
                </div>
                <div className="lp-card-cams">
                  <span className="lp-cam lp-cam-a" />
                  <span className="lp-cam lp-cam-b" />
                </div>
              </div>
            </Reveal>
            <Reveal variant="left" delay={260}>
              <div className="lp-card lp-card-word lp-float">
                <span className="lp-mini-label">Kelime Kartı</span>
                <strong className="lp-word">der Hund</strong>
                <span className="muted small">köpek</span>
              </div>
            </Reveal>
            <Reveal variant="right" delay={360}>
              <div className="lp-card lp-card-quiz lp-float-slow">
                <span className="lp-mini-label">Mini Quiz · 3/5</span>
                <span className="lp-bar">
                  <i style={{ width: '60%', background: '#51cf66' }} />
                </span>
              </div>
            </Reveal>
            <span className="lp-star-badge">★</span>
          </div>
        </div>

        {/* Alt şerit */}
        <div className="lp-wrap">
          <Reveal variant="up" delay={200}>
            <ul className="lp-strip">
              {HERO_BULLETS.map((b) => (
                <li key={b.title}>
                  <span className="lp-sq" style={{ background: b.color }} />
                  {b.title}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ---------- Neden Lumiko ---------- */}
      <section className="lp-sec lp-sec-cream" id="why">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">NEDEN LUMIKO?</p>
            <h2 className="lp-h2">Sıradan bir ders platformu değil, bir öğrenme dünyası</h2>
          </Reveal>
          <div className="lp-grid-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} variant="up" delay={i * 70}>
                <article className="lp-feat">
                  <span className="lp-feat-icon" style={{ background: `${f.color}33` }}>
                    <i style={{ background: f.color }} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Yaşa göre program ---------- */}
      <section className="lp-sec lp-sec-cream">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">YAŞA GÖRE PROGRAM</p>
            <h2 className="lp-h2">Her yaşa uygun bir öğrenme yolu</h2>
          </Reveal>
          <div className="lp-grid-3">
            {AGE_TRACKS.map((t, i) => (
              <Reveal key={t.title} variant="up" delay={i * 90}>
                <article className="lp-age" style={{ background: t.color }}>
                  <span className="lp-age-pill">{t.age}</span>
                  <h3>{t.title}</h3>
                  <p>{t.text}</p>
                  <span className="lp-age-orb" />
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Seviyeler ---------- */}
      <section className="lp-sec" id="levels">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">PROGRAM SEVİYELERİ</p>
            <h2 className="lp-h2">Almanca öğrenme yolculuğunuz</h2>
          </Reveal>
          <div className="lp-grid-3">
            {LEVELS.map((l, i) => (
              <Reveal key={l.name} variant="up" delay={i * 60}>
                <article className="lp-level">
                  <div className="lp-level-top">
                    <strong>{l.name}</strong>
                    <span className="muted small">{l.age}</span>
                  </div>
                  <p className="lp-level-meta">{l.meta}</p>
                  <p className="lp-level-text">{l.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Nasıl çalışır ---------- */}
      <section className="lp-sec lp-sec-cream" id="how">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">NASIL ÇALIŞIR?</p>
            <h2 className="lp-h2">Dört basit adımda başlayın</h2>
          </Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} variant="up" delay={i * 110} className="lp-step">
                <span className="lp-step-num">{s.n}</span>
                <h4>{s.title}</h4>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Canlı ders deneyimi (koyu) ---------- */}
      <section className="lp-sec lp-sec-dark">
        <div className="lp-wrap lp-split">
          <Reveal variant="left">
            <div>
              <p className="lp-eyebrow lp-eyebrow-light">CANLI DERS DENEYİMİ</p>
              <h2 className="lp-h2 lp-h2-light">Gerçek bir Lumiko dersinde neler olur?</h2>
              <p className="lp-lead lp-lead-light">
                Öğretmen ve öğrenci ekranı, kelime kartları, mini quizler ve yıldız kazanımları tek bir
                ekranda — çocuğunuz derse aktif olarak katılır.
              </p>
              <a href="#plans" className="lp-btn lp-btn-white">
                Örnek Sınıfı Görüntüle
              </a>
            </div>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <div className="lp-classroom">
              <div className="lp-card-head">
                <span className="lp-card-title lp-card-title-light">Konu: Hayvanlar 🌿</span>
                <span className="lp-chip lp-chip-live">Canlı</span>
              </div>
              <div className="lp-class-cams">
                <span className="lp-cam lp-cam-a">
                  <em>Öğretmen</em>
                </span>
                <span className="lp-cam lp-cam-c">
                  <em>Öğrenci</em>
                </span>
              </div>
              <div className="lp-class-foot">
                <div className="lp-mini-card">
                  <span className="lp-mini-label">Kelime</span>
                  <strong>die Katze</strong>
                </div>
                <div className="lp-mini-card">
                  <span className="lp-mini-label">İlerleme</span>
                  <span className="lp-bar">
                    <i style={{ width: '70%', background: '#51cf66' }} />
                  </span>
                </div>
                <span className="lp-star-tile">★</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Oyunlaştırma ---------- */}
      <section className="lp-sec">
        <div className="lp-wrap lp-split">
          <Reveal variant="left">
            <div>
              <p className="lp-eyebrow">OYUNLAŞTIRMA SİSTEMİ</p>
              <h2 className="lp-h2">Öğrenmeyi bir keşif yolculuğuna dönüştürüyoruz</h2>
              <p className="lp-lead">
                Yıldızlar, rozetler ve haftalık görevlerle çocuğunuz öğrenmeye motive olur — rekabet
                baskısı olmadan, kendi hızında ilerler.
              </p>
            </div>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <div className="lp-gami">
              <div className="lp-gami-head">
                <strong>Merhaba, Mira! 👋</strong>
                <span className="lp-chip lp-chip-star">
                  ★ <CountUp to={248} />
                </span>
              </div>
              <div className="lp-gami-row">
                <div className="lp-mini-card">
                  <span className="lp-mini-label">Günlük Seri</span>
                  <strong>
                    <CountUp to={7} /> gün
                  </strong>
                </div>
                <div className="lp-mini-card">
                  <span className="lp-mini-label">Bu Hafta</span>
                  <strong>3/5 Görev</strong>
                </div>
              </div>
              <div className="lp-mini-card">
                <span className="lp-mini-label">Seviye İlerlemesi · A1</span>
                <span className="lp-bar lp-bar-lg">
                  <i style={{ width: '68%', background: 'linear-gradient(90deg,#4dabf7,#51cf66)' }} />
                </span>
                <div className="lp-badges">
                  <span style={{ background: '#f2d16b' }} />
                  <span style={{ background: '#ffc9c9' }} />
                  <span style={{ background: '#d0bfff' }} />
                  <span className="lp-badge-empty" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Veli paneli ---------- */}
      <section className="lp-sec lp-sec-cream">
        <div className="lp-wrap lp-split">
          <Reveal variant="left">
            <div>
              <p className="lp-eyebrow">VELİ PANELİ</p>
              <h2 className="lp-h2">Gelişimi her adımda takip edin</h2>
              <p className="lp-lead">
                Ders sonrası değerlendirmeler, aylık ilerleme raporları ve öğretmenle doğrudan iletişim
                — hepsi tek bir panelde.
              </p>
              <Link to="/register" className="lp-btn lp-btn-primary">
                Veli Panelini İncele
              </Link>
            </div>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <div className="lp-parent">
              <span className="lp-mini-label">Bu Ay · İlerleme</span>
              <div className="lp-chart">
                {[38, 55, 72, 60, 88].map((h, i) => (
                  <span key={i} className="lp-chart-bar" style={{ height: `${h}%`, opacity: 0.4 + i * 0.14 }} />
                ))}
              </div>
              <div className="lp-parent-stats">
                <div>
                  <span className="lp-mini-label">Tamamlanan Ders</span>
                  <strong>
                    <CountUp to={12} />
                  </strong>
                </div>
                <div>
                  <span className="lp-mini-label">Yeni Kelime</span>
                  <strong>
                    <CountUp to={86} />
                  </strong>
                </div>
                <div>
                  <span className="lp-mini-label">Konuşma Cesareti</span>
                  <strong className="lp-up">↑ İyi</strong>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Öğretmenler ---------- */}
      <section className="lp-sec" id="teachers">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">ÖĞRETMENLERİMİZ</p>
            <h2 className="lp-h2">Çocuklarla çalışmayı seven uzmanlar</h2>
          </Reveal>
          <div className="lp-grid-3">
            {(cmsTeachers.length > 0
              ? cmsTeachers.map((t, i) => ({
                  key: t.id,
                  name: t.name,
                  title: t.headline ?? '',
                  bio: t.bio ?? '',
                  color: ['#a5d8ff', '#b2f2bb', '#d0bfff'][i % 3],
                  photo: t.photoUrl ? `${API_URL}${t.photoUrl}` : undefined,
                }))
              : TEACHERS.map((t) => ({
                  key: t.name,
                  name: t.name,
                  title: t.title,
                  bio: t.bio,
                  color: t.color,
                  photo: t.photoUrl,
                }))
            ).map((t, i) => (
              <Reveal key={t.key} variant="up" delay={i * 90}>
                <article className="lp-teacher">
                  <div className="lp-teacher-photo" style={{ background: t.color }}>
                    {t.photo ? <img src={t.photo} alt={t.name} /> : <span>öğretmen fotoğrafı</span>}
                  </div>
                  <div className="lp-teacher-body">
                    <h3>{t.name}</h3>
                    <p className="lp-teacher-title">{t.title}</p>
                    <p>{t.bio}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Ders sonu değerlendirmesi ---------- */}
      <section className="lp-sec lp-sec-cream">
        <div className="lp-wrap lp-split">
          <Reveal variant="left">
            <div>
              <p className="lp-eyebrow">DERS SONU DEĞERLENDİRMESİ</p>
              <h2 className="lp-h2">Sadece ders değil, düzenli geri bildirim</h2>
              <p className="lp-lead">
                Her dersin sonunda öğretmenimiz çocuğunuzun gelişimini değerlendirir ve size özet bir
                rapor sunar.
              </p>
            </div>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <div className="lp-eval">
              {EVAL_BARS.map((b, i) => (
                <div key={b.label} className="lp-eval-row">
                  <span className="lp-eval-label">{b.label}</span>
                  <span className="lp-bar">
                    <i
                      className="lp-bar-fill"
                      style={{ width: `${b.pct}%`, background: b.color, transitionDelay: `${i * 90}ms` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Veli yorumları (admin panelinden yönetilir) ---------- */}
      {testimonials.length > 0 && (
        <section className="lp-sec">
          <div className="lp-wrap">
            <Reveal variant="up">
              <p className="lp-eyebrow">VELİLER NE DİYOR?</p>
              <h2 className="lp-h2">Ailelerin gözünden Lumiko</h2>
            </Reveal>
            <div className="lp-grid-3">
              {testimonials.map((t, i) => (
                <Reveal key={t.id} variant="up" delay={i * 80}>
                  <article className="lp-testi">
                    <div className="lp-testi-stars">{'★'.repeat(Math.max(1, Math.min(5, t.rating)))}</div>
                    <p className="lp-testi-text">{t.text}</p>
                    <div className="lp-testi-who">
                      <strong>{t.name}</strong>
                      {t.role && <span className="muted small"> · {t.role}</span>}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Paketler ---------- */}
      <section className="lp-sec" id="plans">
        <div className="lp-wrap">
          <Reveal variant="up">
            <p className="lp-eyebrow">ÜYELİK PAKETLERİ</p>
            <h2 className="lp-h2">Çocuğunuza uygun paketi seçin</h2>
          </Reveal>
          <div className="lp-grid-3">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} variant="up" delay={i * 90}>
                <article className={`lp-plan ${p.featured ? 'is-featured' : ''}`}>
                  {p.featured && <span className="lp-plan-tag">En Çok Tercih Edilen</span>}
                  <h3>{p.name}</h3>
                  <div className="lp-price">
                    ₺<span className="lp-price-blank" />
                  </div>
                  <p className="muted small">/ ay · düzenlenebilir</p>
                  <ul className="lp-plan-list">
                    {p.items.map((it) => (
                      <li key={it}>
                        <i /> {it}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`lp-btn ${p.featured ? 'lp-btn-primary' : 'lp-btn-white'} lp-btn-block`}
                  >
                    Paketi İncele
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- SSS ---------- */}
      <section className="lp-sec lp-sec-cream" id="faq">
        <div className="lp-wrap lp-wrap-narrow">
          <Reveal variant="up">
            <p className="lp-eyebrow">SIK SORULAN SORULAR</p>
            <h2 className="lp-h2">Merak edilenler</h2>
          </Reveal>
          <div className="lp-faq">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} variant="up" delay={i * 60}>
                <div className={`lp-faq-item ${openFaq === i ? 'is-open' : ''}`}>
                  <button className="lp-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    {f.q}
                    <span className="lp-faq-icon">{openFaq === i ? '−' : '+'}</span>
                  </button>
                  <div className="lp-faq-a">
                    <p>{f.a}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Kapanış CTA ---------- */}
      <section className="lp-cta">
        <Reveal variant="zoom">
          <div className="lp-wrap lp-cta-inner">
            <h2>Çocuğunuzun Almanca Yolculuğu Lumiko ile Başlasın</h2>
            <p>Yaşına, seviyesine ve ilgi alanlarına uygun öğrenme programını birlikte oluşturalım.</p>
            <Link to="/register" className="lp-btn lp-btn-white lp-btn-lg">
              Ücretsiz Deneme Dersi Planla
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div>
            <Brand />
            <p className="lp-foot-text">
              Çocuklar için canlı, oyunlaştırılmış ve güvenli online Almanca eğitimi.
            </p>
          </div>
          <div>
            <h5>Eğitimler</h5>
            <a href="#levels">Başlangıç & A1</a>
            <a href="#levels">A2 & B1</a>
            <a href="#levels">Konuşma Kulübü</a>
            <a href="#levels">Okul Destek</a>
          </div>
          <div>
            <h5>Kurumsal</h5>
            <a href="#why">Hakkımızda</a>
            <a href="#teachers">Öğretmenlerimiz</a>
            <a href="#faq">Sık Sorulan Sorular</a>
          </div>
          <div>
            <h5>Destek</h5>
            <a href="#faq">Gizlilik Politikası</a>
            <a href="#faq">Kullanım Koşulları</a>
            <a href="#faq">Çocuk Güvenliği Politikası</a>
            <a href="#faq">KVKK Aydınlatma Metni</a>
          </div>
        </div>
        <div className="lp-wrap lp-foot-bottom">
          <span>© {new Date().getFullYear()} Lumiko. Tüm hakları saklıdır.</span>
        </div>
      </footer>
    </div>
  );
}
