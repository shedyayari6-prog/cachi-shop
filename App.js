// Cachi Store - main app (home, shop, designer, cart, checkout, admin). No customer login.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, Alert, Platform, Modal, Linking, ImageBackground, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CustomCaseScreen, { supabase } from './CustomCaseScreen';

const money = n => `${Number(n).toFixed(2).replace(/\.00$/, '')} TND`;
const notify = (t, m) => (Platform.OS === 'web' ? window.alert(`${t}: ${m}`) : Alert.alert(t, m));
const endsIn = ts => {
  const h = Math.max(0, Math.round((new Date(ts) - new Date()) / 36e5));
  return h >= 24 ? `${Math.round(h / 24)} day(s) left` : `${Math.max(h, 1)} hour(s) left`;
};
const STATUS_COLOR = { pending: '#FF6B4A', confirmed: '#3b82f6', printing: '#8b5cf6', shipped: '#0d9488', delivered: '#16a34a' };
const waLink = ph => { let d = (ph || '').replace(/\D/g, ''); if (d.length === 8) d = '216' + d; return `https://wa.me/${d}`; };
const confirmAsk = (msg, onYes) => {
  if (Platform.OS === 'web') { if (window.confirm(msg)) onYes(); }
  else Alert.alert('Are you sure?', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};
// Share a design or product using a real URL.
const shareIt = async (title, url) => {
  const link = url || (Platform.OS === 'web' ? window.location.href : '');
  const text = `${title} - Cachi Store`;
  try {
    if (Platform.OS !== 'web') {
      await Share.share({ message: `${text}\n${link}`, url: link });
    } else if (navigator.share) {
      await navigator.share({ title: text, text: `Check out ${title} on Cachi Store`, url: link });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      window.alert('Product link copied to clipboard.');
    } else {
      window.prompt('Copy this product link:', link);
    }
  } catch (e) {}
};
const productLink = id => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  return `${window.location.origin}/?product=${encodeURIComponent(id)}`;
};
const STATUSES = ['pending', 'confirmed', 'printing', 'shipped', 'delivered'];

export default function App() {
  const [page, setPage] = useState('home');
  const [cart, setCart] = useState([]);
  const [orderId, setOrderId] = useState(null);
  const [selected, setSelected] = useState(null);
  const taps = useRef({ n: 0, t: null });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('product');
    if (!id) return;
    let active = true;
    supabase.from('products').select('*, phone_models(name)').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (active && data) { setSelected(data); setPage('shop'); }
      });
    return () => { active = false; };
  }, []);

  // hidden admin door: tap the footer text 5 times
  const secretTap = () => {
    clearTimeout(taps.current.t);
    taps.current.n += 1;
    if (taps.current.n >= 5) { taps.current.n = 0; setPage('admin'); return; }
    taps.current.t = setTimeout(() => { taps.current.n = 0; }, 2000);
  };

  const addToCart = item => {
    setCart(c => {
      const same = c.find(i => i.key === item.key);
      return same ? c.map(i => (i.key === item.key ? { ...i, qty: i.qty + 1 } : i)) : [...c, item];
    });
    setSelected(null);
    setPage('cart');
  };
  const count = cart.reduce((n, i) => n + i.qty, 0);

  return (
    <ImageBackground source={require('./assets/background.png')} style={s.root} resizeMode="cover">
      <View style={s.header}>
        <Pressable onPress={() => setPage('home')}><Text style={s.logo}>CACHI STORE</Text></Pressable>
        <View style={s.nav}>
          {[['shop', 'Shop'], ['design', 'Design'], ['cart', `Cart (${count})`]].map(([k, l]) => {
            const on = page === k || (k === 'cart' && page === 'checkout');
            return (
              <Pressable key={k} onPress={() => setPage(k)} style={[s.navItem, on && s.navOn]}>
                <Text style={[s.link, on && { color: '#fff' }]}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={s.body}>
      <View style={s.inner}>
        {page === 'home' && <Home go={setPage} onOpen={setSelected} />}
        {page === 'shop' && <Shop onAdd={addToCart} onOpen={setSelected} />}
        {page === 'design' && <CustomCaseScreen onAdd={addToCart} />}
        {page === 'cart' && <Cart cart={cart} setCart={setCart} go={setPage} />}
        {page === 'checkout' && <Checkout cart={cart} onDone={id => { setOrderId(id); setCart([]); setPage('done'); }} />}
        {page === 'done' && (
          <View style={s.center}>
            <Text style={s.h1}>Thank you!</Text>
            <Text>Order #{orderId?.slice(0, 8)} received. We will call you to confirm.</Text>
            <Btn label="Back to home" onPress={() => setPage('home')} />
          </View>
        )}
        {page === 'admin' && <Admin />}
        {selected && <ProductModal p={selected} onClose={() => setSelected(null)} onAdd={addToCart} />}
        <Pressable onPress={secretTap}><Text style={s.footer}>© Cachi Store</Text></Pressable>
      </View>
      </ScrollView>
    </ImageBackground>
  );
}

const Btn = ({ label, onPress, light, disabled }) => (
  <Pressable disabled={disabled} onPress={onPress} style={[s.btn, light && s.btnLight, disabled && { opacity: 0.5 }]}>
    <Text style={[s.btnText, light && { color: '#111' }]}>{label}</Text>
  </Pressable>
);

function Home({ go, onOpen }) {
  const [items, setItems] = useState([]);
  const [st, setSt] = useState({});
  useEffect(() => { supabase.rpc('public_stats').then(({ data }) => data && setSt(data)); }, []);
  const boxes = [[st.designs, 'custom cases designed'], [st.delivered, 'orders delivered'],
                 [st.products, 'ready-made cases'], [st.models, 'iPhone models (11 to 15)']].filter(([n]) => n > 0);
  useEffect(() => {
    supabase.from('products').select('*, phone_models(name)').limit(4).then(({ data }) => setItems(data || []));
  }, []);
  return (
    <View>
      <View style={s.hero}>
        <Text style={s.badge}>iPhone 11 to 15</Text>
        <Text style={s.heroT}>Your phone.{'\n'}Your design.</Text>
        <Text style={s.heroS}>Premium cases for iPhone 11 to 15. Pick ours or create your own.</Text>
        <Btn label="Design your own case" onPress={() => go('design')} />
        <Btn light label="Browse the shop" onPress={() => go('shop')} />
      </View>
      <View style={s.perks}>
        <Text style={s.perk}>🎨 Design your own</Text>
        <Text style={s.perk}>📦 Cash on delivery</Text>
        <Text style={s.perk}>📱 All iPhone 11-15 models</Text>
      </View>
      {boxes.length > 0 && (
        <View style={s.perks}>
          {boxes.map(([n, l]) => <View key={l} style={s.statBox}><Text style={s.statNum}>{n}</Text><Text style={s.statLbl}>{l}</Text></View>)}
        </View>
      )}
      <Text style={s.h2}>Featured</Text>
      <View style={s.grid}>{items.map(p => <Card key={p.id} p={p} onOpen={onOpen} />)}</View>
      <Text style={[s.h2, { marginTop: 32 }]}>How it works</Text>
      <View style={s.perks}>
        {[['1', 'Choose your iPhone', 'Any model from iPhone 11 to 15.'],
          ['2', 'Design it your way', 'Add your photo, text and colors, and see it live.'],
          ['3', 'Pay on delivery', 'We deliver to you and you pay in cash when it arrives.']].map(([n, t, d]) => (
          <View key={n} style={s.statBox}><Text style={s.statNum}>{n}</Text><Text style={{ fontWeight: '700' }}>{t}</Text><Text style={s.statLbl}>{d}</Text></View>
        ))}
      </View>
      <Btn label="Start designing your case" onPress={() => go('design')} />
    </View>
  );
}

function Card({ p, onAdd, onOpen }) {
  return (
    <Pressable style={s.card} onPress={() => onOpen && onOpen(p)}>
      {p.image_url ? <Image source={{ uri: p.image_url }} style={s.cardImg} /> : <View style={[s.cardImg, s.ph]}><Text style={{ fontSize: 44 }}>📱</Text></View>}
      <Text style={{ fontWeight: '700' }}>{p.title}</Text>
      <Text style={{ color: '#666' }}>{p.phone_models?.name}</Text>
      <Text style={s.price}>{money(p.price)}</Text>
      {onAdd && <Btn label="Add to cart" onPress={() => onAdd({
        key: p.id, kind: 'product', title: p.title, price: Number(p.price), qty: 1, image: p.image_url, payload: { product_id: p.id } })} />}
    </Pressable>
  );
}

function Shop({ onAdd, onOpen }) {
  const [items, setItems] = useState([]);
  const [series, setSeries] = useState(null);
  const [feat, setFeat] = useState([]);
  const [fd, setFd] = useState(null);
  useEffect(() => { supabase.rpc('featured_designs').then(({ data }) => setFeat(data || [])); }, []);
  useEffect(() => {
    supabase.from('products').select('*, phone_models(name, series)').then(({ data }) => setItems(data || []));
  }, []);
  const shown = series ? items.filter(p => p.phone_models?.series === series) : items;
  return (
    <View>
      <Text style={s.h1}>Shop</Text>
      {feat.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text style={s.h2}>✨ Community designs</Text>
          <Text style={{ color: '#7a746a', marginBottom: 10 }}>Made by our customers, on display for a limited time. Love one? Get the same design.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {feat.map(d => (
              <Pressable key={d.id} style={[s.card, { marginRight: 14 }]} onPress={() => setFd(d)}>
                <Image source={{ uri: d.preview_url }} style={[s.cardImg, { aspectRatio: 0.5, backgroundColor: '#F1EBE2' }]} resizeMode="contain" />
                <Text style={{ fontWeight: '700' }}>{d.model}</Text>
                <Text style={{ color: ACC, fontWeight: '700' }}>⏳ {endsIn(d.featured_until)}</Text>
                <Text style={s.price}>{money(d.price)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {fd && <FeaturedModal d={fd} onClose={() => setFd(null)} onAdd={onAdd} />}
      <View style={s.row}>
        {[null, 11, 12, 13, 14, 15].map(v => (
          <Pressable key={v ?? 'all'} onPress={() => setSeries(v)} style={[s.chip, series === v && s.chipOn]}>
            <Text style={series === v && { color: '#fff' }}>{v ? `iPhone ${v}` : 'All'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.grid}>{shown.map(p => <Card key={p.id} p={p} onAdd={onAdd} onOpen={onOpen} />)}</View>
      {!shown.length && <Text style={{ marginTop: 20 }}>No cases yet for this model.</Text>}
    </View>
  );
}

function Stats({ orders }) {
  const sum = list => list.reduce((t, o) => t + Number(o.total || 0), 0);
  const day = new Date().toDateString();
  const today = orders.filter(o => new Date(o.created_at).toDateString() === day);
  const delivered = orders.filter(o => o.status === 'delivered');
  const items = orders.flatMap(o => o.items || []);
  const units = list => list.reduce((n, i) => n + i.qty, 0);
  const custom = units(items.filter(i => !i.title)), ready = units(items.filter(i => i.title));
  const byModel = {};
  items.forEach(i => { if (i.model) byModel[i.model] = (byModel[i.model] || 0) + i.qty; });
  const top = Object.entries(byModel).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const cards = [
    [orders.length, 'orders'], [today.length, 'orders today'],
    [orders.filter(o => o.status === 'pending').length, 'waiting to confirm'],
    [money(sum(orders)), 'total sales'], [money(sum(delivered)), 'delivered sales'],
    [money(orders.length ? sum(orders) / orders.length : 0), 'average order'],
    [custom, 'custom cases sold'], [ready, 'ready-made sold'],
  ];
  return (
    <View>
      <View style={s.perks}>
        {cards.map(([n, l]) => <View key={l} style={s.statBox}><Text style={s.statNum}>{n}</Text><Text style={s.statLbl}>{l}</Text></View>)}
      </View>
      {top.length > 0 && <Text style={{ marginBottom: 12 }}>Top models: {top.map(([m, n]) => `${m} (${n})`).join(' · ')}</Text>}
    </View>
  );
}

function AddProduct({ pass, onSaved }) {
  const [models, setModels] = useState([]);
  const [f, setF] = useState({ title: '', price: '', model: null });
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('phone_models').select('*').order('id').then(({ data }) => setModels(data || [])); }, []);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!r.canceled) setImg(r.assets[0].uri);
  };
  const save = async () => {
    setBusy(true);
    try {
      let url = null;
      if (img) {
        const blob = await (await fetch(img)).blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const path = `products/${Date.now()}.${ext}`;
        const { error: e1 } = await supabase.storage.from('designs').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
        if (e1) throw e1;
        url = supabase.storage.from('designs').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.rpc('admin_add_product', {
        p_pass: pass, p_title: f.title, p_price: Number(f.price), p_model_id: f.model, p_image_url: url });
      if (error) throw error;
      notify('Saved', 'Product added to the shop.');
      onSaved();
    } catch (e) { notify('Error', e.message); }
    setBusy(false);
  };
  const ok = f.title && Number(f.price) > 0 && f.model;
  return (
    <View style={s.order}>
      <Text style={s.h2}>New product</Text>
      <TextInput style={s.input} placeholder="Title (e.g. Blue Waves)" value={f.title} onChangeText={v => setF(x => ({ ...x, title: v }))} />
      <TextInput style={s.input} placeholder="Price in TND" keyboardType="numeric" value={f.price} onChangeText={v => setF(x => ({ ...x, price: v }))} />
      <Text style={{ fontWeight: '600' }}>iPhone model</Text>
      <View style={s.row}>
        {models.map(m => (
          <Pressable key={m.id} onPress={() => setF(x => ({ ...x, model: m.id }))} style={[s.chip, f.model === m.id && s.chipOn]}>
            <Text style={f.model === m.id && { color: '#fff' }}>{m.name}</Text>
          </Pressable>
        ))}
      </View>
      {img && <Image source={{ uri: img }} style={[s.big, { maxWidth: 220 }]} resizeMode="contain" />}
      <Btn light label={img ? 'Change photo' : 'Choose photo'} onPress={pick} />
      <Btn label={busy ? 'Saving...' : 'Save product'} disabled={!ok || busy} onPress={save} />
    </View>
  );
}

const cartItem = p => ({ key: p.id, kind: 'product', title: p.title, price: Number(p.price), qty: 1, image: p.image_url, payload: { product_id: p.id } });

function PopUp({ onClose, children }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

function FeaturedModal({ d, onClose, onAdd }) {
  const add = () => onAdd({
    key: `feat-${d.id}`, kind: 'custom', title: `Community design - ${d.model}`, price: Number(d.price), qty: 1, image: d.preview_url,
    payload: { model_id: d.model_id, case_color: d.case_color, overlay_text: d.overlay_text, preview_url: d.preview_url, flat_url: d.flat_url, has_photo: d.has_photo },
  });
  return (
    <PopUp onClose={onClose}>
      <Image source={{ uri: d.preview_url }} style={s.bigTall} resizeMode="contain" />
      <Text style={s.h2}>Community design · {d.model}</Text>
      {!!d.overlay_text && <Text>"{d.overlay_text}"</Text>}
      <Text style={{ color: ACC, fontWeight: '700', marginTop: 4 }}>⏳ {endsIn(d.featured_until)}</Text>
      <Text style={[s.price, { fontSize: 22, marginVertical: 8 }]}>{money(d.price)}</Text>
      <Btn label="Get this design" onPress={add} />
      <Btn light label="Share this design" onPress={() => shareIt(`Community design for ${d.model}`, d.preview_url)} />
      <Btn light label="Close" onPress={onClose} />
    </PopUp>
  );
}

function ProductModal({ p, onClose, onAdd }) {
  return (
    <PopUp onClose={onClose}>
      {p.image_url
        ? <Image source={{ uri: p.image_url }} style={s.big} resizeMode="contain" />
        : <View style={[s.big, s.ph]}><Text style={{ fontSize: 80 }}>📱</Text></View>}
      <Text style={s.h2}>{p.title}</Text>
      <Text style={{ color: '#666' }}>{p.phone_models?.name}</Text>
      <Text style={[s.price, { fontSize: 22, marginVertical: 8 }]}>{money(p.price)}</Text>
      <Btn label="Add to cart" onPress={() => onAdd(cartItem(p))} />
      <ShareButton label="Share product" onPress={() => shareIt(p.title, productLink(p.id))} />
      <Btn light label="Close" onPress={onClose} />
    </PopUp>
  );
}

function ShareButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={s.shareBtn}>
      <Text style={s.shareIcon}>↗</Text>
      <Text style={s.shareBtnText}>{label}</Text>
    </Pressable>
  );
}

// admin: see a customer's design as the flat print file or on the case
function DesignViewer({ it, pass, onChanged, onClose }) {
  const live = it.featured_until && new Date(it.featured_until) > new Date();
  const feature = async days => {
    const { error } = await supabase.rpc('admin_feature_design', { p_pass: pass, p_design: it.design_id, p_days: days });
    if (error) return notify('Error', error.message);
    notify('Done', days ? `Shown in the shop for ${days} day(s).` : 'Removed from the shop.');
    onChanged(); onClose();
  };
  const [mode, setMode] = useState('flat');
  const url = mode === 'flat' ? it.flat || it.preview : it.preview;
  return (
    <PopUp onClose={onClose}>
      <View style={s.row}>
        {[['flat', 'Flat design (print)'], ['case', 'On the case']].map(([k, l]) => (
          <Pressable key={k} onPress={() => setMode(k)} style={[s.chip, mode === k && s.chipOn]}>
            <Text style={mode === k && { color: '#fff' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Image source={{ uri: url }} style={s.bigTall} resizeMode="contain" />
      <Text>{it.model} · case color {it.color}{it.text ? ` · "${it.text}"` : ''}</Text>
      {it.design_id && (
        <View>
          <Text style={{ fontWeight: '700', marginTop: 6 }}>Show in the shop ("Community designs")</Text>
          <Text style={{ color: it.public_ok ? '#2e8b57' : '#c0392b', marginTop: 2 }}>
            {it.public_ok ? '✓ The customer allowed public display. Choose how long to show it below.' : 'The customer did not allow public display. Ask them first.'}
          </Text>
          {live && <Text style={{ color: ACC }}>On display until {new Date(it.featured_until).toLocaleDateString()}</Text>}
          <View style={s.row}>
            {[1, 3, 7, 30].map(d => <Pressable key={d} style={s.chip} onPress={() => feature(d)}><Text>{d} day{d > 1 ? 's' : ''}</Text></Pressable>)}
            {live && <Pressable style={s.chip} onPress={() => feature(0)}><Text>Remove</Text></Pressable>}
          </View>
        </View>
      )}
      <Btn light label="Share" onPress={() => shareIt(`Custom design for ${it.model}`, url)} />
      <Btn label="Open full size / download" onPress={() => Linking.openURL(url)} />
      <Btn light label="Close" onPress={onClose} />
    </PopUp>
  );
}

const cartTotal = cart => cart.reduce((t, i) => t + i.price * i.qty, 0);

function Cart({ cart, setCart, go }) {
  const change = (key, d) => setCart(c => c.map(i => (i.key === key ? { ...i, qty: i.qty + d } : i)).filter(i => i.qty > 0));
  if (!cart.length) return <View style={s.center}><Text style={s.h1}>Your cart is empty</Text><Btn label="Start shopping" onPress={() => go('shop')} /></View>;
  return (
    <View>
      <Text style={s.h1}>Cart</Text>
      {cart.map(i => (
        <View key={i.key} style={s.line}>
          {i.image ? <Image source={{ uri: i.image }} style={s.thumb} /> : <View style={[s.thumb, { backgroundColor: '#eee' }]} />}
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{i.title}</Text><Text>{money(i.price)}</Text></View>
          <Pressable onPress={() => change(i.key, -1)} style={s.qty}><Text>-</Text></Pressable>
          <Text style={{ marginHorizontal: 8 }}>{i.qty}</Text>
          <Pressable onPress={() => change(i.key, 1)} style={s.qty}><Text>+</Text></Pressable>
        </View>
      ))}
      <Text style={s.total}>Total: {money(cartTotal(cart))}</Text>
      <Btn label="Checkout" onPress={() => go('checkout')} />
    </View>
  );
}

function Checkout({ cart, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', address: '', city: '' });
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  const valid = f.name && f.phone && f.address && f.city;

  const submit = async () => {
    setBusy(true);
    const items = cart.map(i => ({ kind: i.kind, qty: i.qty, ...i.payload }));
    const { data, error } = await supabase.rpc('place_order', { p_customer: f, p_items: items });
    setBusy(false);
    if (error) return notify('Error', error.message);
    onDone(data);
  };

  return (
    <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <Text style={s.h1}>Checkout</Text>
      {[['name', 'Full name'], ['phone', 'Phone'], ['address', 'Address'], ['city', 'City']].map(([k, ph]) => (
        <TextInput key={k} style={s.input} placeholder={ph} value={f[k]} onChangeText={set(k)} />
      ))}
      <Text style={{ marginVertical: 10 }}>Payment: cash on delivery.</Text>
      <Text style={s.total}>Total: {money(cartTotal(cart))}</Text>
      <Btn label={busy ? 'Placing order...' : 'Place order'} disabled={!valid || busy || !cart.length} onPress={submit} />
    </View>
  );
}

function OrderCard({ o, onStatus, onView }) {
  const next = STATUSES[STATUSES.indexOf(o.status) + 1];
  const live = ts => ts && new Date(ts) > new Date();
  return (
    <View style={s.order}>
      <View style={s.between}>
        <Text style={{ fontWeight: '800' }}>#{o.id.slice(0, 8)} · {money(o.total)}</Text>
        <Text style={[s.badge2, { backgroundColor: STATUS_COLOR[o.status] || '#999' }]}>{o.status}</Text>
      </View>
      <Text style={s.mut}>{new Date(o.created_at).toLocaleString()}</Text>
      <Text style={{ fontWeight: '700' }}>{o.customer_name} · {o.phone}</Text>
      <Text>{o.address}, {o.city}</Text>
      <View style={s.row}>
        <Pressable style={s.chip} onPress={() => Linking.openURL(`tel:${o.phone}`)}><Text>📞 Call</Text></Pressable>
        <Pressable style={s.chip} onPress={() => Linking.openURL(waLink(o.phone))}><Text>💬 WhatsApp</Text></Pressable>
      </View>
      {(o.items || []).map((it, n) => (
        <View key={n} style={s.line}>
          {it.preview && <Pressable onPress={() => onView(it)}><Image source={{ uri: it.preview }} style={s.thumb} /></Pressable>}
          <Text style={{ flex: 1 }}>
            {live(it.featured_until) ? '⭐ ' : it.public_ok ? '🌍 ' : ''}{it.qty}x {it.title || 'Custom case (tap image)'} · {it.model}{it.text ? ` · "${it.text}"` : ''}
          </Text>
        </View>
      ))}
      {next && <Btn label={`Mark as ${next} →`} onPress={() => onStatus(o.id, next)} />}
      <View style={s.row}>
        {STATUSES.map(st => (
          <Pressable key={st} onPress={() => onStatus(o.id, st)} style={[s.chip, o.status === st && s.chipOn]}>
            <Text style={o.status === st && { color: '#fff' }}>{st}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ProductsTab({ pass }) {
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.rpc('admin_products', { p_pass: pass });
    if (error) notify('Error', error.message); else setList(data);
  };
  useEffect(() => { load(); }, []);
  const del = p => confirmAsk(`Delete "${p.title}"?`, async () => {
    const { data, error } = await supabase.rpc('admin_delete_product', { p_pass: pass, p_id: p.id });
    if (error) return notify('Error', error.message);
    if (data === 'hidden') notify('Hidden', 'This product is in past orders, so it was hidden from the shop instead of erased.');
    load();
  });
  return (
    <View>
      <Btn label={adding ? 'Close form' : '＋ Add new product'} onPress={() => setAdding(x => !x)} />
      {adding && <AddProduct pass={pass} onSaved={() => { setAdding(false); load(); }} />}
      <Text style={[s.h2, { marginTop: 18 }]}>All products ({list.length})</Text>
      {list.map(p => (
        <View key={p.id} style={[s.order, !p.active && { opacity: 0.5 }]}>
          <View style={s.line}>
            {p.image_url ? <Image source={{ uri: p.image_url }} style={s.thumb} /> : <View style={[s.thumb, s.ph]}><Text>📱</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{p.title}</Text>
              <Text style={s.mut}>{p.model} · {money(p.price)}{p.active ? '' : ' · hidden'}</Text>
            </View>
            {p.active && <Pressable style={s.chip} onPress={() => del(p)}><Text style={{ color: '#c0392b' }}>🗑 Delete</Text></Pressable>}
          </View>
        </View>
      ))}
    </View>
  );
}

function EmailsTab({ pass }) {
  const [d, setD] = useState({ emails: [], has_key: false });
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const load = async () => {
    const { data, error } = await supabase.rpc('admin_emails_list', { p_pass: pass });
    if (error) notify('Error', error.message); else setD(data);
  };
  useEffect(() => { load(); }, []);
  const call = async (fn, args, ok) => {
    const { error } = await supabase.rpc(fn, { p_pass: pass, ...args });
    if (error) return notify('Error', error.message);
    if (ok) notify('Done', ok);
    load();
  };
  return (
    <View>
      <View style={s.order}>
        <Text style={s.h2}>Order emails</Text>
        <Text style={s.mut}>Every new order sends an email to these addresses.</Text>
        {d.emails.map(e => (
          <View key={e.id} style={s.line}>
            <Text style={{ flex: 1 }}>{e.email}</Text>
            <Pressable style={s.chip} onPress={() => confirmAsk(`Remove ${e.email}?`, () => call('admin_email_delete', { p_id: e.id }))}><Text>Remove</Text></Pressable>
          </View>
        ))}
        <TextInput style={[s.input, { marginTop: 10 }]} placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Btn label="Add email" disabled={!email.includes('@')} onPress={() => { call('admin_email_add', { p_email: email.trim() }); setEmail(''); }} />
      </View>
      <View style={s.order}>
        <Text style={s.h2}>Email sending</Text>
        <Text style={{ color: d.has_key ? '#16a34a' : '#c0392b', marginBottom: 8 }}>{d.has_key ? '✓ Resend API key saved' : '⚠ No API key yet, so no emails are sent'}</Text>
        <TextInput style={s.input} placeholder="Resend API key (re_...)" secureTextEntry autoCapitalize="none" value={key} onChangeText={setKey} />
        <Btn light label="Save key" disabled={!key} onPress={() => { call('admin_set_setting', { p_key: 'resend_api_key', p_value: key.trim() }, 'Key saved.'); setKey(''); }} />
        <Btn label="Send a test email" onPress={() => call('admin_test_email', {}, 'Test email sent. It can take a minute to arrive.')} />
      </View>
    </View>
  );
}

function Admin() {
  const [pass, setPass] = useState('');
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState('new');
  const [view, setView] = useState(null);

  const load = async (p = pass) => {
    const { data, error } = await supabase.rpc('admin_orders', { p_pass: p });
    if (error) return notify('Error', error.message);
    setOrders(data);
  };
  const setStatus = async (id, status) => {
    const { error } = await supabase.rpc('admin_set_status', { p_pass: pass, p_id: id, p_status: status });
    if (error) notify('Error', error.message); else load();
  };

  if (!orders) return (
    <View style={{ maxWidth: 360, alignSelf: 'center', width: '100%' }}>
      <Text style={s.h1}>Admin</Text>
      <TextInput style={s.input} placeholder="Passcode" secureTextEntry value={pass} onChangeText={setPass} />
      <Btn label="Enter" onPress={() => load()} />
    </View>
  );

  const fresh = orders.filter(o => o.status !== 'delivered');
  const done = orders.filter(o => o.status === 'delivered');
  const tabs = [['dash', '📊 Dashboard'], ['new', `🆕 New orders (${fresh.length})`], ['done', `✅ Delivered (${done.length})`], ['products', '🛍 Products'], ['emails', '✉️ Emails']];
  const list = l => (l.length ? l.map(o => <OrderCard key={o.id} o={o} onStatus={setStatus} onView={setView} />) : <Text style={s.mut}>Nothing here yet.</Text>);

  return (
    <View>
      <View style={s.between}>
        <Text style={s.h1}>Admin</Text>
        <Pressable onPress={() => load()}><Text style={s.link}>↻ Refresh</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14, flexGrow: 0 }}>
        {tabs.map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.navItem, tab === k && s.navOn, { marginRight: 6 }]}>
            <Text style={[s.link, tab === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {view && <DesignViewer it={view} pass={pass} onChanged={() => load()} onClose={() => setView(null)} />}
      {tab === 'dash' && <Stats orders={orders} />}
      {tab === 'new' && list(fresh)}
      {tab === 'done' && list(done)}
      {tab === 'products' && <ProductsTab pass={pass} />}
      {tab === 'emails' && <EmailsTab pass={pass} />}
    </View>
  );
}

const INK = '#1B1B1F', ACC = '#FF6B4A', BG = '#FAF7F2';
const shadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
const s = StyleSheet.create({
  root: { flex: 1, width: '100%', ...(Platform.OS === 'web' ? { minHeight: '100vh' } : {}), backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', ...shadow },
  logo: { fontSize: 18, fontWeight: '800', letterSpacing: 4, color: INK },
  nav: { flexDirection: 'row', gap: 6 },
  navItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  navOn: { backgroundColor: ACC },
  link: { fontWeight: '600', color: INK },
  body: { flexGrow: 1, padding: 20, width: '100%', backgroundColor: 'transparent' },
  inner: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  center: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  hero: { backgroundColor: INK, borderRadius: 28, padding: 32, gap: 12, marginBottom: 20 },
  badge: { alignSelf: 'flex-start', backgroundColor: ACC, color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, overflow: 'hidden' },
  heroT: { color: '#fff', fontSize: 38, fontWeight: '800', lineHeight: 44 },
  heroS: { color: '#cfcfd4', marginBottom: 8, fontSize: 15 },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  perk: { flex: 1, minWidth: 150, backgroundColor: '#fff', borderRadius: 14, padding: 14, textAlign: 'center', fontWeight: '600', overflow: 'hidden' },
  h1: { fontSize: 28, fontWeight: '800', marginBottom: 12, color: INK },
  h2: { fontSize: 21, fontWeight: '800', marginBottom: 14, color: INK },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { width: 200, backgroundColor: '#fff', borderRadius: 18, padding: 12, gap: 4, ...shadow },
  cardImg: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 6 },
  ph: { backgroundColor: '#F1EBE2', alignItems: 'center', justifyContent: 'center' },
  price: { fontWeight: '800', color: ACC, fontSize: 16, marginTop: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e3ddd3', backgroundColor: '#fff' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  btn: { backgroundColor: ACC, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  btnLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: ACC, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, marginTop: 8 },
  shareIcon: { color: ACC, fontSize: 18, fontWeight: '800', lineHeight: 18 },
  shareBtnText: { color: INK, fontWeight: '700', fontSize: 15 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#efe9df' },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#F1EBE2' },
  qty: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  total: { fontSize: 20, fontWeight: '800', marginVertical: 14, color: INK },
  input: { borderWidth: 1, borderColor: '#e3ddd3', borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#fff' },
  order: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, ...shadow },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: '#fff', borderRadius: 22, padding: 18, width: '100%', maxWidth: 440, maxHeight: '94%' },
  big: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#F1EBE2', marginBottom: 10 },
  bigTall: { width: '100%', height: 420, borderRadius: 14, backgroundColor: '#F1EBE2', marginVertical: 10 },
  statBox: { flex: 1, minWidth: 140, backgroundColor: '#fff', borderRadius: 16, padding: 16, ...shadow },
  statNum: { fontSize: 26, fontWeight: '800', color: ACC },
  statLbl: { color: '#7a746a', marginTop: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge2: { color: '#fff', fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  mut: { color: '#7a746a', marginBottom: 6 },
  footer: { textAlign: 'center', color: '#cdc7bc', marginTop: 40, fontSize: 12 },
});
