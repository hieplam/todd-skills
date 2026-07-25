# 10 ideas cho tribe — rút từ vụ Bun Zig→Rust rewrite

> Nguồn phân tích: bài gốc https://bun.com/blog/bun-in-rust (đọc trực tiếp, 3 lượt trích xuất khác góc)
> + file handoff `bun-rust-migration-analysis-handoff.md` (4 lượt hội thoại claude.ai).
> Hiện trạng tribe được ground vào file thật của plugin (`plugins/tribe/`), có `file:line`.
>
> Hai cơ chế xương sống của vụ Bun mà các ideas xoay quanh:
> 1. **Cell per work-item** — mỗi đơn vị công việc được xử lý bởi một "cell" 4 vai stateless
>    (1 implementer + 2 adversarial reviewers + 1 fixer), spawn mới cho từng item, xong thì biến mất.
> 2. **Context isolation giữa các review** — implementer thấy nguồn gốc + plan + reasoning của nó;
>    reviewer chỉ thấy diff trần, được prime "mặc định code sai", và 2 reviewer KHÔNG thấy nhau.
>    Nguyên văn blog: implementer = *"the .zig original, the port plan, its own reasoning"*;
>    reviewer = *"only the diff. told to assume the code is wrong"*.

---

## Idea 1 — Nâng audit đơn lẻ thành cell 4 vai: 1 Hunter + 2 Skinner độc lập + 1 Fixer

**Bun làm gì:** mỗi work-item chạy qua đúng một pseudocode Jarred in trong bài:
`feedback = await Promise.all([review(result), review(result)])` — **hai** review độc lập chạy song song,
rồi một fixer riêng apply. *"1 implementer, 2 or more adversarial reviewers per implementer."*
Toán recall: mỗi reviewer sót bug với xác suất p → hai con độc lập sót ~p² (bắt 70% mỗi con → ~91% cả cặp).

**Tribe hiện tại:** Warchief step 6 dispatch **một** Skinner duy nhất per task
(`warchief.md:441-454`), loop fix tối đa 3 vòng. Một reviewer = một lần sampling = một tập điểm mù.

**Apply:** ở step 6, dispatch **2 Skinner instance song song** (một lệnh Task, 2 tool-use cùng message
để chạy concurrent), mỗi con một context riêng, không con nào thấy findings của con kia.
Warchief merge findings ở tầng trên. Chi phí thêm ~1 lượt Skinner (model `sonnet`, rẻ) đổi lấy
recall tăng đáng kể trên chính cái gate authoritative nhất của tribe.

---

## Idea 2 — Context asymmetry tuyệt đối: Skinner không bao giờ được thấy reasoning của Hunter

**Bun làm gì:** reviewer chỉ thấy diff — **không thấy reasoning của implementer** — vì
*"the Claude that wrote the code wants the code to get accepted"*: đọc lời tự biện minh của
implementer sẽ "thuyết phục" reviewer bỏ qua lỗi. Ba bug thật bị bắt (use-after-free trong
`Box<uv::Pipe>`, `trunc()` với mtime âm, `unwrap_or` eager-eval) đều compile sạch và trông plausible —
chỉ context lạnh mới bắt được.

**Tribe hiện tại:** Hunter viết report file đầy reasoning (RED proof, giải thích, concerns —
`hunter.md:113-124`), và Warchief là người cầm cả report lẫn brief khi dispatch Skinner. Không có
rule nào **cấm** Warchief đưa report/reasoning của Hunter vào dispatch của Skinner — rò rỉ context
là mặc định dễ xảy ra, không phải ngoại lệ.

**Apply:** thêm rule tường minh vào cả `warchief.md` (step 6) lẫn `skinner.md` (Operating rules):
dispatch của Skinner chỉ được chứa **contract (spec/plan) + diff + repo rules** — cấm đính kèm
report file của Hunter, lời kể của Warchief về "Hunter đã cẩn thận thế nào", hay bất kỳ narrative
nào của bên viết code. Skinner tự chạy proof, tự dựng hiểu biết. Một dòng rule, đổi lấy việc bịt
đúng kênh bias mà Bun xác định là lý do tồn tại của adversarial review.

---

## Idea 3 — Decorrelate 2 reviewer bằng bất đối xứng INPUT, không phải prompt

**Bun làm gì (và giới hạn):** blog không nói 2 reviewer có lens khác nhau — cách đọc mặc định là
2 bản sao cùng prompt, diversity đến từ sampling. Điểm yếu (handoff §4.2 đã mổ): cùng model + cùng
prompt + cùng input → chia sẻ điểm mù của chính model. Thiết kế mạnh hơn được đề xuất:
**bất đối xứng hóa input** — con A thấy diff + nguồn tham chiếu (soi tính trung thành); con B chỉ
thấy diff trần (soi code như một reviewer không biết context). Hai phân phối input khác nhau → hai
phân phối lỗi khác nhau, mà không dính taxonomy risk của việc gán lens cứng.

**Tribe hiện tại:** Skinner luôn đọc contract fully-first rồi mới nhìn code (`skinner.md:121-123`).
Nếu chỉ nhân đôi Skinner (Idea 1), cả hai con cùng một input distribution.

**Apply (chồng lên Idea 1):** hai chế độ dispatch cho cặp reviewer:
- **Skinner A — "contract lens"**: như hiện tại — contract + diff + chạy proof (đây là con giữ verdict
  PASS/FAIL authoritative, vì chỉ nó có contract để đối chiếu).
- **Skinner B — "cold lens"**: CHỈ nhận diff + lệnh "mặc định code sai, tìm lý do nó không chạy" —
  không spec, không plan. Nó bắt lớp bug mà con A bị contract dẫn dắt bỏ qua: lỗi ngôn ngữ/idiom,
  evaluation order, resource leak — đúng 3 class bug blog kể.
Findings của B là **giả thuyết** nhập vào phiên adjudicate của Warchief, không phải verdict.

---

## Idea 4 — Disagreement giữa 2 reviewer là tín hiệu định tuyến, không phải lỗi hệ thống

**Bun làm gì:** khi suggestions mâu thuẫn (workflow sinh LIFETIMES.tsv), không chọn bừa —
chạy **một vòng review nữa** + con người đọc tay. Handoff chốt bảng định tuyến: hai con cùng tố một
chỗ → confidence cao, fix thẳng; một tố một im → giả thuyết cho fixer cân nhắc; hai tố ngược chiều →
escalate lên tầng nhiều context hơn. Agreement giữa các sample độc lập = phép đo confidence rẻ.

**Tribe hiện tại:** không có khái niệm này — một Skinner, một verdict, FAIL là fix
(`warchief.md:441-454`). Nếu áp Idea 1+3 mà không có luật hợp findings, Warchief sẽ tự chế cách merge
mỗi lần một kiểu.

**Apply:** thêm bảng adjudication tường minh vào Warchief step 6:
- Cả A và B cùng flag một vị trí → **Critical mặc nhiên**, đi thẳng vào brief của fixer Hunter.
- Chỉ một con flag → fixer Hunter được quyền adjudicate (xem Idea 5) — false positive rẻ, cứ để tầng dưới lọc.
- A và B mâu thuẫn trực diện (con này đòi sửa theo hướng X, con kia theo hướng ngược X) → **không tự
  hòa giải**: một vòng review thứ ba hoặc `NEEDS_DIRECTION` nếu mâu thuẫn lộ ra ambiguity của spec.

---

## Idea 5 — Fixer là một role riêng có quyền BỎ claim: "đừng bắt reviewer đúng — làm cho cái sai của nó rẻ"

**Bun làm gì:** cell có **4 vai** vì fixer tách khỏi cả implementer lẫn reviewer:
*"The implementer doesn't review. The reviewer doesn't implement."* Output của reviewer là
**giả thuyết**, không phải phán quyết — fixer đọc, claim vô lý thì bỏ; sửa mà sai thì compiler/test
chặn. Nhờ vậy reviewer được phép hung hăng (prime "mặc định sai") mà hệ không chết vì false positive.

**Tribe hiện tại:** Warchief "feed Critical/Important findings back to a fixer Hunter"
(`warchief.md:445-446`) — nhưng fixer Hunter nhận brief kiểu thi hành lệnh; `hunter.md` không cho nó
mandate adjudicate. Trong khi verdict của Skinner là "authoritative — a FAIL must be fixed, never
argued away" — cứng hơn mô hình Bun một nấc, dễ dẫn đến fix theo claim sai.

**Apply:** giữ nguyên "FAIL must be fixed" ở mức **verdict** (phải xử lý xong mới PASS), nhưng brief
của fixer Hunter được nói rõ: từng **finding** là giả thuyết — fixer phải reproduce được finding
trước khi sửa; không reproduce được thì ghi "not reproduced + bằng chứng" vào report thay vì sửa mù.
Vòng re-audit của Skinner (đã có sẵn) chính là trọng tài: nếu Skinner vẫn FAIL với evidence mới thì
finding đứng, nếu PASS thì finding rụng. Khớp luôn nguyên tắc #3 của handoff §4.4: đầu tư vào tầng
adjudication thay vì ép reviewer hoàn hảo.

---

## Idea 6 — Frozen shared artifact per campaign: một "PORTING.md của tribe"

**Bun làm gì:** trước khi fan-out, đóng băng trí khôn thành artifact: PORTING.md (3 tiếng đối thoại
→ serialize) + LIFETIMES.tsv (một workflow riêng + 2 adversarial reviews). Ba tác dụng: (a) trăm
agent stateless ra quyết định **nhất quán** — judgment call thành lookup; (b) quyết định global được
tính trước một lần thay vì mỗi agent tự đoán từ context local; (c) reviewer có văn bản đối chiếu —
style compliance thành tiêu chí **kiểm tra được**. Bonus hạ tầng: shared prefix giống nhau cho mọi
agent → prompt cache (tỷ lệ 72B cached / 5.9B uncached ≈ 12:1 của vụ Bun).

**Tribe hiện tại:** đã có idea card + Standing Constraints (`shaman.md:79-86`) và spec/plan per card —
nhưng đó là artifact **per-card**. Không có artifact **per-campaign** đóng băng các quyết định
xuyên-card: convention đặt tên, pattern test, error-handling style, những ruling lặp lại trong
Decision Log.

**Apply:** thêm vào Shaman Mode 2 một bước "forge the codex": trước khi dispatch card đầu tiên của
một campaign nhiều card, Shaman chưng cất từ repo + Decision Log một `docs/tribe/CODEX.md`
(dạng bảng tra được, kiểu TSV/markdown table — greppable như LIFETIMES.tsv), cho **một vòng Skinner
review chính cái codex đó** (Bun review cả PORTING.md lẫn LIFETIMES.tsv trước khi dùng), rồi đóng băng.
Mọi brief của Hunter và mọi dispatch của Skinner/Tracker tham chiếu nó. Tracker được thêm một nguồn
rule để đọc fresh (`tracker.md:29-37` đã có sẵn cơ chế đọc rule từ file — chỉ thêm đường dẫn).

---

## Idea 7 — Mechanical work queue: task sinh từ tool deterministic, không phải từ prose của planner

**Bun làm gì:** work queue là output của máy — *"For each crate, run cargo check, group the output
by file and save the errors to a file"* → ~16,000 errors chia cho 64 Claudes; phase test: mỗi failing
test lưu stacktrace ra file → 1 cell per failure. Queue sinh bởi tool deterministic, agent chỉ
consume → không goal drift, không "quên item thứ 1,337".

**Tribe hiện tại:** plan của Warchief là văn xuôi do LLM viết rồi LLM đọc lại để dispatch
(`warchief.md:363-374`). `validate-plan.sh` đã check hình thức plan — nhưng nguồn task vẫn là prose.
Với loại việc đồng dạng (fix N test failures, N lint errors, N vi phạm rule), prose là nơi drift chui vào.

**Apply:** thêm script `scripts/build-queue.sh` cạnh `validate-plan.sh`: chạy proof command của repo
(test suite / lint / build), parse mỗi failure thành một dòng
`queue.tsv` (id, file, error digest, stacktrace path). Warchief có rule mới: khi card thuộc dạng
"fix/repair đồng dạng" (regression sweep, lint sweep, coverage sweep), **plan phải trỏ vào queue.tsv**
— mỗi dòng = một task = một cell (Idea 1), thay vì Warchief tự kể danh sách bằng văn.
Đây là dạng việc tribe làm hằng tuần chứ không phải chỉ trong mega-migration.

---

## Idea 8 — Đẩy wave-orchestration từ prose xuống code

**Bun làm gì:** coordination nằm trong **JavaScript workflow script** — loop, branching, intermediate
results sống trong code, đốt 0 model token; context của Claude chỉ chứa kết quả cuối. Bốn bất lợi của
điều phối bằng agent (handoff §2.3, có nguồn docs): context bottleneck → agentic laziness; token cost
tuyến tính theo quyết định routing; non-determinism ở chỗ không cần judgment; không reproducible/resume.

**Tribe hiện tại:** Warchief step 5 là ~70 dòng prose mô tả thuật toán wave (merge từng branch theo
thứ tự, cleanup worktree, re-record base SHA, tạo worktree wave sau — `warchief.md:363-433`) mà
**LLM phải thi hành bằng tay từng lệnh git**. Tribe đã đi nửa đường rồi: `heartbeat-check.sh`,
`resume-check.sh`, `validate-plan.sh` chính là triết lý "cái gì deterministic thì đẩy xuống code".

**Apply:** viết `scripts/integrate-wave.sh <worktree> <branch...>` gói trọn chuỗi deterministic:
merge --no-ff theo thứ tự → xóa worktree/branch đã merge → in SHA mới làm base cho wave sau →
exit code phân biệt "conflict" (để Warchief `NEEDS_DIRECTION` đúng như rule hiện tại). Warchief chỉ
còn giữ phần judgment: audit kết quả wave, adjudicate findings, quyết escalate. Bớt ~50 dòng prompt,
bớt hẳn một lớp lỗi thi-hành-sai-thuật-toán.

---

## Idea 9 — "Persistent policy, ephemeral instance": làm mới context của Warchief/Shaman theo chu kỳ

**Bun làm gì:** "Warchief" thật là Jarred — authority persistent, nhưng **zero coordination mechanics
trong đầu**; mọi state sống ở file và git. Handoff lượt 3 chốt: persistence của *state* ≠ persistence
của *context window*; context sống lâu vừa điều phối vừa phán đoán là liability tích lũy — sau 50 task
toàn noise, đúng lúc cần judgment sắc nhất thì trí khôn bơi giữa rác.

**Tribe hiện tại:** đã có đủ hạ tầng để instance chết đi sống lại: state file + trailers + Decision
Log + `resume-check.sh` (`warchief.md:129-193`, `shaman.md:147-149` "Memory is files, not instances").
Nhưng cơ chế này chỉ kích hoạt khi **crash** — một Warchief sống dai qua 5 wave vẫn ôm 5 wave noise.

**Apply:** biến crash-resume thành **chu kỳ chủ động**: rule mới cho Shaman — dispatch Warchief
**fresh per card** là mặc định đã đúng, nhưng thêm: với card nhiều wave, Warchief tự kết thúc sau khi
integrate mỗi wave (commit state, ghi heartbeat "wave N integrated, re-dispatch me") và Shaman
re-dispatch một Warchief mới đọc `resume-check.sh` để chạy wave N+1. Mỗi lần thức dậy: đọc đúng luật
cũ từ file, sạch noise. Chi phí gần zero vì toàn bộ máy móc resume đã build xong ở PR #22 — chỉ đổi
trigger từ "khi chết" thành "mỗi wave".

---

## Idea 10 — Meta-loop "sửa process, đừng sửa tay code" + tripwires cơ học

**Bun làm gì:** câu tổng kết của chính Jarred: *"fixing the process that generates the code instead
of hand-fixing the code."* Suốt 11 ngày ổng không sửa code — thấy failure pattern (stub function,
comment biện minh dài, git stash chồng chéo) là **sửa workflow prompt/rule**. Và các rule đều dạng
gần-cơ-học: *"If you need a paragraph-long comment to justify why the workaround is OK, the code is
wrong — fix the code"*; cấm mọi git command không phải commit-một-file.

**Tribe hiện tại:** Tracker đã có đúng nửa cơ chế: đọc rules fresh mỗi lần chạy, "khi rule được
thêm/sửa, review đổi theo tự động — không cần sửa agent" (`tracker.md:21-23`). Thiếu nửa còn lại:
**không ai có nhiệm vụ viết rule mới khi một failure pattern lặp lại** — bài học chết ở từng vòng audit.

**Apply:** thêm một bước vào Warchief step 6 và Shaman verify-SHIPPED: khi cùng một failure pattern
xuất hiện **≥2 lần** (2 vòng fix cùng lý do, 2 card cùng loại FAIL), người có authority tương ứng
không chỉ fix — mà **ghi một rule mới dạng tripwire kiểm-tra-được** vào nguồn rule mà Tracker/Skinner
đọc (`.claude/rules/` hoặc CODEX.md của Idea 6), ví dụ: "comment >3 dòng biện minh workaround = Blocker",
"stub/`todo!`/`NotImplementedException` mới trong diff = Blocker", "test bị weaken/skip = Blocker"
(cái cuối đã là anti-goal của Hunter — `hunter.md:103-104` — nhưng chưa là rule Tracker check được).
Vòng lặp khép kín: pattern → rule → mọi review sau tự động enforce → pattern không tái diễn.

---

## Bonus (ngoài 10, nhưng đáng ghi): Trial run trước khi fan-out

Bun port **3 file** làm proof-of-concept, chỉnh workflow, rồi mới scale lên 1,448. Với tribe: khi một
plan có wave ≥3 sub-plan song song, Warchief nên chạy **wave 0 = 1 task đại diện** qua trọn cell
(Hunter → 2 Skinner → Fixer), dùng kết quả để chỉnh brief template, rồi mới dispatch cả wave.
Giá một task, mua sự tự tin cho cả campaign.

---

## Tóm tắt ưu tiên

| # | Idea | Effort | Ăn vào cơ chế Bun nào |
|---|------|--------|----------------------|
| 1 | Cell 4 vai: 2 Skinner song song | Thấp (sửa prompt Warchief) | Cell per work-item, p² recall |
| 2 | Cấm rò reasoning của Hunter vào Skinner | Rất thấp (1 rule) | Context isolation |
| 3 | Decorrelate bằng input asymmetry (contract lens / cold lens) | Thấp | Context isolation nâng cao |
| 4 | Bảng định tuyến disagreement | Thấp | Reconcile round của LIFETIMES.tsv |
| 5 | Fixer có quyền bỏ claim (reproduce-first) | Thấp | Reviewer sai được phép rẻ |
| 6 | CODEX.md đóng băng per campaign | Vừa | PORTING.md / LIFETIMES.tsv |
| 7 | Mechanical work queue (`build-queue.sh`) | Vừa | cargo-check-as-queue |
| 8 | `integrate-wave.sh` — coordination xuống code | Vừa | Workflow-as-code |
| 9 | Ephemeral Warchief per wave | Thấp (đổi trigger resume) | Persistent policy, ephemeral instance |
| 10 | Meta-loop: pattern lặp → rule mới cho Tracker | Thấp | "Fix the process, not the code" |

Thứ tự làm đề xuất: **2 → 1 → 5 → 4** (cụm adversarial-review, toàn sửa prompt, ăn ngay vào chất lượng
audit) → **10 → 6** (cụm rule/artifact) → **7 → 8 → 9** (cụm hạ tầng script) → 3 (tinh chỉnh sau khi
1 chạy ổn).
