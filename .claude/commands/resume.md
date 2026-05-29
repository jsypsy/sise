이전 세션 맥락을 복원해줘. 다음 순서로 진행:

1. 프로젝트 루트의 `CLAUDE.md`를 읽어 프로젝트 정체성과 6개 원칙 확인
   (특히 5번 Free-Tier-Aware Architecture의 불변 아키텍처 결정과 정제·시그널 규칙 레퍼런스 표)
2. `.claude/sessions/` 폴더에서 가장 최근 파일 3개를 읽어 최근 작업 맥락 파악
3. 현재 git 브랜치와 마지막 커밋 확인 (`git status`, `git log -5 --oneline`)
4. 작업 중이던 PROMPT 파일 확인 (`.claude/PROMPT_*.md`, 현재 활성: `.claude/PROMPT_build_mvp.md`)
   — Phase 1~7 중 어디까지 끝났는지 파악
5. 위 내용을 종합해 다음을 간단히 요약 보고:
   - 현재 어떤 작업/어떤 Phase 중이었는지
   - 다음에 할 일이 무엇인지
   - 주의해야 할 불변 원칙이나 제약 (특히: 수집은 GitHub Actions에서만, 시그널은 Postgres 뷰,
     일별 화면 ISR, service_role 서버 전용, 정제 규칙)
6. 내 다음 지시를 기다림 (멋대로 코드 작성 시작하지 말 것)
