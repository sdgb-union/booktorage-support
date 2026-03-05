# Admin Pages

정적 관리자 페이지입니다. `register-book` Edge Function을 사용합니다.

## 1) 배포용 설정 파일

배포 시에는 `config.public.js`를 사용합니다.

- 파일: `admin/config.public.js`
- 현재 값은 `booktorage` Supabase 프로젝트 기준으로 세팅되어 있습니다.
- 관리자 이메일은 코드/서버 모두 `sdgb.union@gmail.com` 기준입니다.

참고용 템플릿은 `config.example.js`입니다.

## 2) GitHub Pages 배포 (booktorage-support/admin)

목표 구조(권장):

1. `booktorage-support` 저장소 루트 하위에 `admin/` 폴더 생성
2. 이 폴더에 아래 파일들을 배치
   - `admin/index.html`
   - `admin/register-book.html`
   - `admin/config.public.js`
   - `admin/assets/` 폴더
3. GitHub Pages를 브랜치 루트로 활성화
4. `.../admin/index.html` 경로로 접속

현재 HTML은 상대경로(`./assets/...`)를 사용하므로 `admin/` 하위 배치에 바로 맞습니다.

## 3) Supabase Auth 설정 (Email OTP)

1. Supabase Dashboard -> `Authentication` -> `Providers` -> `Email` 활성화
2. `Enable email signups`는 관리자 전용이면 비활성 권장
3. `Authentication` -> URL 설정의 Redirect URLs에 실제 페이지 URL 추가

예시 (`admin/` 하위 배치 기준):

- `https://<username>.github.io/booktorage-support/admin/index.html`
- `https://<username>.github.io/booktorage-support/admin/register-book.html`

## 4) 포함된 페이지

- `index.html`: 관리자 홈
- `register-book.html`: `register-book` Edge Function 호출

## 5) 권한/동작 요약

- 관리자 이메일(`sdgb.union@gmail.com`)로 등록하면 즉시 등록 (`is_pending_review = null`)
- 그 외 유저는 등록 요청 상태 (`is_pending_review = true`)
- 노출은 `books_view`에서 `is_pending_review IS NULL`만 표시

## 6) 보안 메모

- `service_role` 키는 절대 프론트에 넣지 마세요.
- `anon/publishable key`는 프론트 노출 가능하지만, 권한 검증은 서버에서 해야 합니다.
- 현재 `register-book` 서버 로직에서 관리자 이메일 분기를 수행합니다.
