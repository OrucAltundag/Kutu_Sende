# Son Kutu — web prototipi

Konsept belgesindeki MVP önceliğine göre hazırlanmış oynanabilir Klasik Mod prototipi.

## Çalıştırma

```powershell
node server.mjs
```

Tarayıcıda `http://localhost:4173` adresini açın.

## Doğrulama

```powershell
node --test tests/game-engine.test.mjs
```

## Oyun modları

- **Klasik Mod:** Tek oyuncu kendi final kutusunu seçer ve 9 turda bankacıyla pazarlık eder.
- **Parti Modu:** Aynı telefon, tablet veya bilgisayarda 2-4 kişi oynar. Herkes kendi final kutusunu seçer; kutu açma sırası adil biçimde döner.

## Tur ve bankacı akışı

- Tur planı, oyun başında oyuncu sayısına göre kilitlenir. Oyuncu teklif kabul edip ayrılsa bile oyunun temposu değişmez.
- Bankacı geldiğinde o anki ödül havuzu dondurulur. Tüm aktif oyuncular kendi teklifini aynı havuz durumuna göre alır ve kararlar birlikte sonuçlanır.
- Kabul eden oyuncuların kişisel kutuları, diğer oyuncuların kararları tamamlanmadan açılmaz.
- Başlangıçta **Klasik Bankacı** (varsayılan) veya **Değişken Bankacı** seçilir. Değişken modda Analist, Stratejist ya da Risk Avcısı oyun boyunca aynı kalır.
- Son teklifin sonunda, kabul ya da red kararından sonra tüm kutular açılır; parti modunda en yüksek kazanç yarışı kazanır.

## Aynı cihazda gizlilik

- Parti modunda cihaz her önemli hamleden sonra sıradaki oyuncuya devredilir.
- Bankacı teklifleri oyunculara sırayla ve gizli gösterilir; bir oyuncu diğerinin teklifini veya kararını göremez.
- Bütün kararlar kaydedildikten sonra ekranda sırayla açıklanır.
- Final ekranı sıralama, önemli kararlar ve eğlenceli maç unvanları içerir.

## GitHub Pages

`master` dalına yapılan her gönderim, `.github/workflows/deploy-pages.yml` ile GitHub Pages yayınını tetikler. Depo ayarlarından **Settings → Pages → Build and deployment → GitHub Actions** seçeneğini bir kez etkinleştirin. Yayın adresi:

`https://orucaltundag.github.io/Kutu_Sende/`

## Sonraki teslim sırası

1. Sunucu otoriteli oda ve oturum modeli
2. Kod ile odaya katılım, yeniden bağlanma ve seyirci oylaması
3. Hesap/ilerleme, analiz ve günlük meydan okuma
4. Dengeleme, moderasyon ve yayın altyapısı
