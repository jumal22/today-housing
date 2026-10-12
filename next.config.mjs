/** @type {import('next').NextConfig} */
const nextConfig = {
  // "/" 로 들어와도 주소창에 /plan3d.html 이 안 보이고, "/gallery" 로 들어와도
  // /gallery.html 이 안 보이도록, 리다이렉트 대신 내부적으로만 해당 html을
  // 내려주는 rewrite를 사용함 (주소창은 그대로 유지됨).
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/plan3d.html" },
        { source: "/gallery", destination: "/gallery.html" },
        // 게시물 상세 페이지 — "/post?id=..." 로 들어와도 주소창에 /post.html 이 안 보이게 함.
        // 쿼리스트링(?id=...)은 rewrite와 별개로 그대로 유지되므로 post.html의 JS에서
        // location.search로 그대로 읽을 수 있음.
        { source: "/post", destination: "/post.html" },
        // 이용약관·개인정보처리방침 (구글 로그인 동의 화면에 넣는 공개 주소)
        { source: "/terms", destination: "/terms.html" },
        { source: "/privacy", destination: "/privacy.html" },
      ],
    };
  },
};

export default nextConfig;

