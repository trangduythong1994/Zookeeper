# Zookeeper — Feature Notes

## #0. Pokémon private test setup `/pk-stup`

- Chỉ Administrator dùng được; phản hồi chỉ người gọi thấy.
- Tạo category riêng tư `pk-test-kanto` và bốn biome test: forest, grassland, cave, river.
- Mỗi biome channel có một status message được ghim.
- Chạy lại an toàn, không nhân bản category/channel/message đã có.
- Bot cần **Manage Channels**, **View Channel**, **Send Messages**, và **Manage Messages**.
- `/pk-rm` chỉ Administrator dùng được và xóa một lượt mọi category có prefix `pk-test-` cùng toàn bộ channel bên trong.

## #0.1. Pokémon region and biome data

- `src/pokemon/data/regions.ts` là manifest data-driven của toàn bộ 11 Region và biome hợp lệ theo Region.
- Chưa có category/channel mới nào được tạo từ manifest này.
- Private test subset được chọn là `kanto` và `hoenn` để kiểm tra biome cơ bản lẫn biome đặc biệt.

## #1. Text-to-speech trong voice channel

- `-s <nội dung>`: đọc tiếng Việt.
- `-sen <content>`: đọc tiếng Anh.
- `--s <nội dung>`: xóa tin nhắn nguồn và đọc tiếng Việt theo kiểu “`<tên> thì thầm rằng ...`”.
- `--sen <content>`: xóa tin nhắn nguồn và đọc tiếng Anh theo cách đọc thông thường.
- `-g <nội dung>` và `-gen <content>`: dùng Google TTS để đọc lần lượt tiếng Việt và tiếng Anh.
- `--g` và `--gen`: biến thể Google TTS có xóa tin nhắn nguồn; `--g` đọc theo kiểu thì thầm.
- Nếu bàn phím mobile tự đổi `--` thành `–` hoặc `—` ở đầu lệnh, bot hiểu chúng như `--`.
- Các lệnh không phân biệt hoa/thường: `-S`, `-SEN`, `--S`, và `--SEN` đều hợp lệ.
- Bot tính từ trong toàn bộ lệnh, bao gồm prefix. Nếu từ 50% số từ trở lên viết HOA, bot đổi phần giới thiệu thành `<tên> gào thét rằng ...` (hoặc `shouts` cho tiếng Anh).
- Người dùng phải đang ở voice channel. Nếu không, bot trả lời hướng dẫn tham gia voice trước.
- Khi nội dung có tag user, bot đọc display name/nickname của user trong server thay vì đọc Discord ID.
- Lần đọc đầu, sau 30 giây, hoặc khi đổi người nói, bot thêm tên người gửi. Những tin liên tiếp của cùng người gửi trong 30 giây không đọc lại tên.
- `-s`/`-sen` và lời chào voice dùng Edge TTS; `-g`/`-gen` luôn dùng Google Translate TTS miễn phí. Nếu Edge TTS thất bại sau ba lần thử, bot tự chuyển sang Google TTS để đọc tiếp. Tất cả đều qua FFmpeg và Discord voice.

## #2. Lệnh xác suất `/chance`

- Cú pháp: `/chance question:<câu hỏi>`.
- Bot quay ngẫu nhiên từ `0%` đến `100%` và trả về câu phản hồi theo khoảng xác suất.
- Lệnh được đăng ký theo từng Discord server khi bot khởi động hoặc khi bot tham gia server mới.

## #3. Lệnh màu tên `/color`

- Cú pháp: `/color x:#RRGGBB`, ví dụ `/color x:#FF00AA`.
- Bot kiểm tra mã hex sáu ký tự.
- Mọi role của người dùng có tên dạng `#RRGGBB` được gỡ trước khi tạo role mới.
- Role màu cũ không còn thành viên sẽ bị xóa.
- Role mới được đặt màu theo mã hex, đưa ngay dưới role cao nhất của bot và gán cho người dùng.
- Bot cần quyền **Manage Roles** và role bot phải nằm cao hơn role màu cần quản lý.

## #4. Tự động vào/rời voice và chào thành viên

- Khi Zookeeper chưa ở voice trong server, một người thật vào hoặc chuyển sang một voice channel sẽ khiến bot vào cùng và đọc: `<tên> đã đến.`
- Khi Zookeeper đang ở voice channel, bất kỳ người thật nào vào hoặc chuyển sang channel đó cũng được đọc: `<tên> đã đến.`
- Không áp dụng cho bot, việc rời voice, hoặc thay đổi trạng thái trong cùng channel.
- Khi người thật cuối cùng rời channel mà Zookeeper đang ở, bot tự rời. Mọi bot đều không được tính là người thật.
- Các lời chào được xếp hàng và luôn ưu tiên hơn các lệnh đọc chat.
- Bot không cắt ngang âm thanh đang phát. Sau khi câu đang phát hoàn tất, mọi lời chào chờ sẽ được phát trước các lệnh đọc chat đã chờ.
- Trong khi một lời chào đang phát hoặc còn chờ, các lệnh `-s`, `-sen`, `--s`, `--sen` mới không được đưa vào hàng đợi. Bot trả lời `Tao đang nói, đợi một chút!`; riêng `--s` và `--sen` vẫn xóa tin nhắn nguồn.

## #5. Theo dõi user cụ thể

- User được theo dõi: `493076491106779148`.
- Channel nhận thông báo: `1513220978816319538`.
- Khi user này vào voice, chuyển giữa voice channel, hoặc rời voice, bot gửi thông báo vào channel đã cấu hình. Tin nhắn ping `@everyone`, không ping user theo dõi.
- Bot cũng gửi thông báo khi status của user đi qua ranh giới:
  - `offline` → `online`, `idle`, hoặc `dnd`.
  - `online`, `idle`, hoặc `dnd` → `offline`.
- Các thay đổi giữa `online`, `idle` và `dnd` không tạo thông báo.
- `dnd` là **Do Not Disturb** (Không làm phiền).

## #6. Quyền và Gateway Intents cần bật

- Quyền Discord: **View Channel**, **Connect**, **Speak**, **Send Messages**, **Manage Messages**, và **Manage Roles**.
- OAuth2 scopes: `bot` và `applications.commands`.
- Trong Discord Developer Portal → **Bot** → **Privileged Gateway Intents**, bật **Message Content Intent** và **Presence Intent**.
- Để bot hiển thị đúng màu role, đưa role bot lên cao hơn các role màu trong Server Settings → Roles.

## #7. Kiểm tra và chạy bot

```bash
npm run lint
npm run typecheck
npm test
npm start
```

File `.env` phải có `DISCORD_TOKEN=<token bot>` và không được commit lên GitHub.
