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

- **Klasik Mod:** Tek oyunculu tam oyun akışı.
- **Parti Modu:** Aynı telefon, tablet veya bilgisayarda 2-4 oyuncu sırayla kutu açar. Ortak kutu ilk oyuncu tarafından seçilir; tur sırası ekranda görünür ve teklif kararı sıradaki oyuncudadır.

## GitHub Pages

`master` dalına yapılan her gönderim, `.github/workflows/deploy-pages.yml` ile GitHub Pages yayınını tetikler. Depo ayarlarından **Settings → Pages → Build and deployment → GitHub Actions** seçeneğini bir kez etkinleştirin. Yayın adresi:

`https://orucaltundag.github.io/Kutu_Sende/`

## Sonraki teslim sırası

1. Sunucu otoriteli oda ve oturum modeli
2. Kod ile odaya katılım, yeniden bağlanma ve seyirci oylaması
3. Hesap/ilerleme, analiz ve günlük meydan okuma
4. Dengeleme, moderasyon ve yayın altyapısı
