import sqlite3
import streamlit as st

# ---------- DB Bağlantı ----------
def get_connection():
    conn = sqlite3.connect("restaurant.db")
    conn.row_factory = sqlite3.Row
    return conn

# ---------- Ayar / Sabitleme Yardımcıları ----------
def ensure_settings_tables():
    conn = get_connection()
    cur = conn.cursor()

    # Genel ayarlar tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Sabitleme öncesi fiyat yedeği
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fixed_price_backup (
            product_id INTEGER PRIMARY KEY,
            price REAL NOT NULL,
            FOREIGN KEY(product_id) REFERENCES products(id)
        )
    """)

    conn.commit()
    conn.close()


def is_fixed_mode_active():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'fixed_mode'")
    row = cur.fetchone()
    conn.close()
    return (row is not None) and (row["value"] == "1")


def set_fixed_mode(active: bool):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO settings (key, value)
        VALUES ('fixed_mode', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, ("1" if active else "0",))
    conn.commit()
    conn.close()


def apply_fixed_prices():
    """
    Fiyat sabitleme modunu başlat:
    - Hedef ürünlerin şu anki fiyatlarını yedeğe al
    - Fiyatlarını sabit değerlere çek
    - fixed_mode = 1
    """
    fixed_values = {
        "Bira": 80,
        "Tekila": 130,
        "Vodka": 180,
        "Viski": 230,
    }

    conn = get_connection()
    cur = conn.cursor()

    # Eski yedekleri temizle (her başlatılışta sıfırdan alınsın)
    cur.execute("DELETE FROM fixed_price_backup")

    # Her ürün için: mevcut fiyatı yedekle, sonra sabit fiyata çek
    for name, fixed_price in fixed_values.items():
        cur.execute("SELECT id, price FROM products WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            pid = row["id"]
            old_price = row["price"]
            # yedek tabloya kaydet
            cur.execute(
                "INSERT INTO fixed_price_backup (product_id, price) VALUES (?, ?)",
                (pid, old_price),
            )
            # sabit fiyatı uygula
            cur.execute(
                "UPDATE products SET price = ? WHERE id = ?",
                (fixed_price, pid),
            )

    conn.commit()
    conn.close()
    set_fixed_mode(True)


def restore_prices_from_backup():
    """
    Fiyat sabitleme modunu bitir:
    - fixed_price_backup'taki fiyatları geri yükle
    - yedek tabloyu temizle
    - fixed_mode = 0
    """
    conn = get_connection()
    cur = conn.cursor()

    # Yedekten fiyatları geri yükle
    cur.execute("SELECT product_id, price FROM fixed_price_backup")
    rows = cur.fetchall()
    for row in rows:
        cur.execute(
            "UPDATE products SET price = ? WHERE id = ?",
            (row["price"], row["product_id"]),
        )

    # Yedekler temizlenir
    cur.execute("DELETE FROM fixed_price_backup")

    conn.commit()
    conn.close()
    set_fixed_mode(False)

# ---------- DB Şema / Başlangıç ----------
def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY(table_id) REFERENCES tables(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )
    """)

    # Ayar/sabitleme tabloları
    ensure_settings_tables()

    # Örnek ürünler
    cur.execute("SELECT COUNT(*) as c FROM products")
    if cur.fetchone()["c"] == 0:
        cur.executemany(
            "INSERT INTO products (name, price) VALUES (?, ?)",
            [
                ("Bira", 100),
                ("Tekila", 150),
                ("Viski", 250),
                ("Vodka", 200),
            ],
        )

    # Örnek masalar
    cur.execute("SELECT COUNT(*) as c FROM tables")
    if cur.fetchone()["c"] == 0:
        cur.executemany(
            "INSERT INTO tables (name) VALUES (?)",
            [("Masa 1",), ("Masa 2",), ("Masa 3",), ("Masa 4",)],
        )

    conn.commit()
    conn.close()

# ---------- Temel DB Fonksiyonları ----------
def get_products():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products")
    rows = cur.fetchall()
    conn.close()
    return rows


def add_product(name, price):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO products (name, price) VALUES (?, ?)", (name, price))
    conn.commit()
    conn.close()


def update_product_price(product_id, new_price):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE products SET price = ? WHERE id = ?", (new_price, product_id))
    conn.commit()
    conn.close()


def get_tables():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tables")
    rows = cur.fetchall()
    conn.close()
    return rows


def get_orders_for_table(table_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            o.id,
            p.name AS product_name,
            o.unit_price,
            o.quantity,
            (o.unit_price * o.quantity) AS total
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.table_id = ?
    """, (table_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def add_order(table_id, product_id, unit_price, quantity):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO orders (table_id, product_id, unit_price, quantity) VALUES (?, ?, ?, ?)",
        (table_id, product_id, unit_price, quantity),
    )
    conn.commit()
    conn.close()


def clear_orders_for_table(table_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM orders WHERE table_id = ?", (table_id,))
    conn.commit()
    conn.close()

# ---- Borsa Bar fiyat güncelleme fonksiyonu ----
def update_prices_after_order(ordered_product_id, quantity=1):
    """
    Bir ürün için sipariş alındığında:
    - fixed_mode açıksa hiçbir fiyat değişmez.
    - fixed_mode kapalıysa:
        * Sipariş edilen ürünün fiyatını 5 * quantity artırır.
        * Diğer ürünlerin fiyatını 1 * quantity azaltır (0'ın altına düşmez).
    """
    if is_fixed_mode_active():
        # Fiyat sabitleme modunda fiyatlar değişmeyecek
        return

    try:
        quantity = int(quantity)
    except ValueError:
        quantity = 1

    if quantity < 1:
        quantity = 1

    conn = get_connection()
    cur = conn.cursor()

    # Sipariş edilen ürün: +5 * quantity
    cur.execute("""
        UPDATE products
        SET price = price + (5 * ?)
        WHERE id = ?
    """, (quantity, ordered_product_id))

    # Diğer ürünler: -1 * quantity (0 altına düşmesin)
    cur.execute("""
        UPDATE products
        SET price = CASE
                        WHEN price > ? THEN price - ?
                        ELSE price
                    END
        WHERE id != ?
    """, (quantity, quantity, ordered_product_id))

    conn.commit()
    conn.close()

# ---------- Streamlit UI ----------
def admin_page():
    st.header("Admin Paneli - Ürün Yönetimi")

    st.subheader("Ürün Listesi (Anlık Fiyatlar)")
    products = get_products()
    if products:
        st.table([
            {"ID": p["id"], "Ürün": p["name"], "Fiyat": p["price"]}
            for p in products
        ])
    else:
        st.info("Henüz ürün yok.")

    st.subheader("Yeni Ürün Ekle")
    new_name = st.text_input("Ürün adı")
    new_price = st.number_input("Fiyat", min_value=0.0, step=1.0)
    if st.button("Ürün Ekle"):
        if new_name and new_price > 0:
            add_product(new_name, new_price)
            st.success("Ürün eklendi.")
            st.rerun()
        else:
            st.error("Lütfen ürün adı ve pozitif fiyat girin.")

    st.subheader("Fiyat Güncelle")
    if products:
        product_options = {f'{p["name"]} (ID:{p["id"]})': p["id"] for p in products}
        selected_product_label = st.selectbox(
            "Ürün seç",
            list(product_options.keys())
        )
        selected_product_id = product_options[selected_product_label]
        new_price2 = st.number_input("Yeni fiyat", min_value=0.0, step=1.0, key="upd_price")
        if st.button("Fiyatı Güncelle"):
            update_product_price(selected_product_id, new_price2)
            st.success("Fiyat güncellendi.")
            st.rerun()

    # ---------- Fiyat Sabitleme Modu ----------
    st.subheader("Fiyat Sabitleme (Borsa Modu Durdur)")

    fixed_active = is_fixed_mode_active()
    col1, col2 = st.columns(2)

    with col1:
        # Yeşil Başlat
        start_disabled = fixed_active
        if st.button("🟢 Başlat", disabled=start_disabled):
            apply_fixed_prices()
            st.success("Fiyat sabitleme modu başlatıldı.")
            st.rerun()

    with col2:
        # Kırmızı Bitir
        stop_disabled = not fixed_active
        if st.button("🔴 Bitir", disabled=stop_disabled):
            restore_prices_from_backup()
            st.success("Fiyat sabitleme modu sonlandırıldı.")
            st.rerun()


def tables_page():
    st.header("Masalar & Siparişler")

    tables = get_tables()
    if not tables:
        st.warning("Hiç masa tanımlı değil.")
        return

    num_cols = 4  # aynı satırda kaç masa kartı olsun
    cols = st.columns(num_cols)

    for idx, t in enumerate(tables):
        table_id = t["id"]
        table_name = t["name"]
        col = cols[idx % num_cols]

        with col:
            with st.container():
                # Üst bar: masa adı + kırmızı kare silme butonu
                h1, h2 = st.columns([4, 1])
                with h1:
                    st.markdown(f"**{table_name}**")
                with h2:
                    if st.button("🟥", key=f"clear_{table_id}"):
                        clear_orders_for_table(table_id)
                        st.success("Masanın tüm siparişleri silindi.")
                        st.rerun()

                # Masanın sipariş listesi
                orders = get_orders_for_table(table_id)
                if orders:
                    total_sum = sum(o["total"] for o in orders)
                    st.table([
                        {
                            "Ürün": o["product_name"],
                            "Adet": o["quantity"],
                            "Birim Fiyat": o["unit_price"],
                            "Tutar": o["total"],
                        }
                        for o in orders
                    ])
                    st.markdown(f"Toplam: **{total_sum:.2f} ₺**")
                else:
                    st.write("Sipariş yok.")

                # Çoklu ürün siparişi ekleme bölümü
                with st.expander("Sipariş Ekle"):
                    products = get_products()

                    selected_products = []
                    for p in products:
                        c1, c2, c3 = st.columns([3, 2, 2])
                        with c1:
                            checked = st.checkbox(
                                p["name"],
                                key=f"chk_{table_id}_{p['id']}"
                            )
                        with c2:
                            st.write(f"{p['price']} ₺")
                        with c3:
                            # 🚩 Burayı değiştirdik: number_input yerine selectbox
                            qty = st.selectbox(
                                "Adet",
                                options=list(range(1, 11)),
                                key=f"qty_{table_id}_{p['id']}",
                            )

                        if checked:
                            # Seçilen ürünler: (id, adet, o anki fiyat)
                            selected_products.append((p["id"], qty, p["price"]))

                    if st.button("Siparişi Kaydet", key=f"add_{table_id}"):
                        if not selected_products:
                            st.warning("Herhangi bir ürün seçilmedi.")
                        else:
                            # 1) Seçilen ürünleri, o anki fiyatlarıyla orders tablosuna ekle
                            for prod_id, qty, price_now in selected_products:
                                add_order(table_id, prod_id, price_now, qty)

                            # 2) fixed_mode kapalıysa borsa mantığı ile fiyatları güncelle
                            if not is_fixed_mode_active():
                                for prod_id, qty, _ in selected_products:
                                    update_prices_after_order(prod_id, qty)

                            st.success("Siparişler eklendi.")
                            st.rerun()


def main():
    st.set_page_config(page_title="Borsa Pub Sipariş Prototipi", layout="wide")
    init_db()

    st.sidebar.title("Menü")
    page = st.sidebar.radio("Sayfa", ["Admin - Ürünler", "Masalar & Siparişler"])

    if page == "Admin - Ürünler":
        admin_page()
    else:
        tables_page()


if __name__ == "__main__":
    main()
