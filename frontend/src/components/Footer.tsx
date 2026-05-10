export default function Footer() {
  return (
    <footer className="footer-site">
      <p>&copy; {new Date().getFullYear()} Edward Lai. All rights reserved.</p>
      <p>Developed by Edward Lai</p>
      <p className="footer-contact">
        <a href="mailto:EdwardL9039@gmail.com">EdwardL9039@gmail.com</a>
        <span aria-hidden className="footer-sep">
          {' · '}
        </span>
        <a href="https://www.chess.com/member/EdwardL903" target="_blank" rel="noopener noreferrer">
          Chess.com @EdwardL903
        </a>
      </p>
    </footer>
  );
}
