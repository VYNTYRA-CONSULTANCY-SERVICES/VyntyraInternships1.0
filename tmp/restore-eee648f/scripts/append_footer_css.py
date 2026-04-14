from pathlib import Path

footer_css = """
.footer {
    background: #010205;
    color: #f8f9fb;
    padding: 3rem 1rem 2rem;
}

.footer-top {
    max-width: 1200px;
    margin: 0 auto 2rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.75rem;
}

.footer-brand {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.footer-logo {
    font-size: 1rem;
    letter-spacing: 0.6em;
    color: #ff8b30;
    margin: 0;
}

.footer-tagline {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
    margin: 0;
}

.footer-description {
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.74);
    margin: 0;
}

.footer-contact-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8rem;
}

.footer-contact-line {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
}

.contact-label {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
}

.footer-contact-line a {
    color: #ffffff;
    opacity: 0.9;
    text-decoration: none;
}

.footer-column h6 {
    margin-bottom: 0.9rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-size: 0.75rem;
    color: #ff8b30;
}

.footer-column ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.footer-column li {
    font-size: 0.85rem;
}

.footer-column a {
    color: rgba(255, 255, 255, 0.85);
    text-decoration: none;
}

.footer-column a:hover {
    text-decoration: underline;
}

.footer-subscribe p {
    margin: 0 0 0.6rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
}

.footer-subscribe-form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.footer-subscribe-form input {
    flex: 1;
    min-width: 170px;
    padding: 0.85rem 1rem;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: #f9fbff;
    font-family: inherit;
}

.footer-subscribe-form button {
    border-radius: 999px;
    border: none;
    padding: 0.85rem 1.8rem;
    background: #ff8b30;
    color: #040308;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}

.footer-bottom {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.65);
    flex-wrap: wrap;
}

.footer-socials {
    display: flex;
    gap: 0.4rem;
}

.footer-socials a {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f8f9fb;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.6rem;
    text-decoration: none;
}

@media (max-width: 768px) {
    .footer-top {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }

    .footer-bottom {
        flex-direction: column;
        align-items: flex-start;
    }
}
"""

path = Path('assets/css/premium-style.css')
path.write_text(path.read_text().rstrip() + "\n" + footer_css + "\n")
