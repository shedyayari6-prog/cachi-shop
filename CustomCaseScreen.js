// Cachi Store - case designer: drag, resize and rotate the photo and the text, pick fonts
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, ScrollView, StyleSheet, PanResponder, Platform, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient('https://rccnrlbaygahzvclxyuf.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjY25ybGJheWdhaHp2Y2x4eXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzA3MjMsImV4cCI6MjEwNjcwNjcyM30.8g3nBFVmeNxbPoAX3s0RPWrxVUn-v1SmOf6D3MTWrPo'); 
const CW = 230, CH = 460; // case size on screen
const CASE_COLORS = ['#ffffff', '#111111', '#f4a6b7', '#9ec5fe', '#b8e0c2', '#ffd966', '#c9b6f2', '#ff6b4a'];
const TEXT_COLORS = ['#ffffff', '#111111', '#ff6b4a', '#ffd966', '#9ec5fe', '#f4a6b7', '#b8e0c2'];
const FONTS = [
  { id: 'Montserrat', native: 'System' },
  { id: 'Pacifico', native: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' }) },
  { id: 'Bebas Neue', native: Platform.select({ ios: 'Avenir Next Condensed', default: 'sans-serif-condensed' }) },
  { id: 'Lobster', native: Platform.select({ ios: 'Noteworthy', default: 'cursive' }) },
  { id: 'Permanent Marker', native: Platform.select({ ios: 'Marker Felt', default: 'sans-serif-medium' }) },
  { id: 'Playfair Display', native: Platform.select({ ios: 'Georgia', default: 'serif' }) },
  { id: 'Courier Prime', native: Platform.select({ ios: 'Courier New', default: 'monospace' }) },
];
const family = f => (Platform.OS === 'web' ? `'${f.id}', sans-serif` : f.native);
const tnd = n => `${Number(n).toFixed(2).replace(/\.00$/, '')} TND`;
const web = Platform.OS === 'web';
const grab = web ? { cursor: 'grab', userSelect: 'none' } : {};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// makes a view draggable and remembers its position
function useDrag() {
  const [p, setP] = useState({ x: 0, y: 0 });
  const cur = useRef(p); cur.current = p;
  const base = useRef(p);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { base.current = cur.current; },
    onPanResponderMove: (_, g) => setP({ x: base.current.x + g.dx, y: base.current.y + g.dy }),
  })).current;
  return [p, setP, pan.panHandlers];
}

const Stepper = ({ label, value, onMinus, onPlus }) => (
  <View style={s.stepRow}>
    <Text style={s.stepLabel}>{label}</Text>
    <Pressable style={s.stepBtn} onPress={onMinus}><Text style={s.stepTxt}>−</Text></Pressable>
    <Text style={s.stepVal}>{value}</Text>
    <Pressable style={s.stepBtn} onPress={onPlus}><Text style={s.stepTxt}>+</Text></Pressable>
  </View>
);

export default function CustomCaseScreen({ onAdd }) {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(null);
  const [color, setColor] = useState(CASE_COLORS[0]);
  const [tab, setTab] = useState('photo');
  const [photo, setPhoto] = useState(null);
  const [ph, setPh] = useState({ scale: 1, rot: 0, aspect: 1 });
  const [text, setText] = useState('');
  const [tx, setTx] = useState({ size: 34, color: '#ffffff', font: FONTS[1], bold: true, rot: 0 });
  const [photoPos, setPhotoPos, photoPan] = useDrag();
  const [textPos, setTextPos, textPan] = useDrag();
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false); // customer agrees to show the design publicly
  const [err, setErr] = useState('');
  const previewRef = useRef(null); // the case (with camera) = mockup
  const artRef = useRef(null);     // the flat artwork only = print file

  useEffect(() => {
    supabase.from('phone_models').select('*').order('id')
      .then(({ data }) => { setModels(data || []); setModel(data?.[0]); });
    if (web) { // load the fonts for the website
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Pacifico&family=Bebas+Neue&family=Lobster&family=Permanent+Marker&family=Playfair+Display:wght@700&family=Courier+Prime:wght@700&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled) return;
    const a = res.assets[0];
    setPhoto(a.uri);
    setPh({ scale: 1, rot: 0, aspect: a.width / a.height });
    setPhotoPos({ x: 0, y: 0 });
  };
  const fillCase = () => setPh(p => ({ ...p, scale: Math.max(1, CH / (CW / p.aspect)) }));
  const rotate = (set, d) => set(o => ({ ...o, rot: ((o.rot + d + 180) % 360) - 180 }));

  // price rules come from the database (table "pricing"); these are only fallbacks
  const [prices, setPrices] = useState({ plain: 15, color: 15, text: 25, photo: 30, both_before: 40, both: 35 });
  useEffect(() => {
    supabase.from('pricing').select('*').then(({ data }) => {
      if (data?.length) setPrices(p => ({ ...p, ...Object.fromEntries(data.map(r => [r.id, Number(r.price)])) }));
    });
  }, []);
  const hasText = text.trim().length > 0, hasPhoto = !!photo;
  const key = hasText && hasPhoto ? 'both' : hasPhoto ? 'photo' : hasText ? 'text' : color !== CASE_COLORS[0] ? 'color' : 'plain';
  const price = prices[key], was = key === 'both' ? prices.both_before : null;

  const upload = async (ref, name) => {
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    const blob = await (await fetch(uri)).blob();
    const { error } = await supabase.storage.from('designs').upload(name, blob, { contentType: 'image/png' });
    if (error) throw error;
    return supabase.storage.from('designs').getPublicUrl(name).data.publicUrl;
  };

  const addToCart = async () => {
    setBusy(true); setErr('');
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const flatUrl = await upload(artRef, `guest/flat-${id}.png`);     // plain design, no case
      const previewUrl = await upload(previewRef, `guest/case-${id}.png`); // design on the case
      onAdd({
        key: id, kind: 'custom', title: `Custom case - ${model.name}`, price,
        qty: 1, image: previewUrl,
        payload: { model_id: model.id, case_color: color, overlay_text: text, preview_url: previewUrl, flat_url: flatUrl, public_ok: share, has_photo: hasPhoto },
      });
    } catch (e) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.brand}>Cachi Store</Text>
      <Text style={s.title}>Design your own case</Text>
      <Text style={s.sub}>Drag the photo and the text with your finger or mouse.</Text>

      <View ref={previewRef} collapsable={false} style={s.case}>
        <View ref={artRef} collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: color }]}>
        {photo && (
          <View style={s.layer} pointerEvents="box-none">
            <View {...photoPan} style={[grab, { transform: [{ translateX: photoPos.x }, { translateY: photoPos.y }, { rotate: `${ph.rot}deg` }, { scale: ph.scale }] }]}>
              <Image source={{ uri: photo }} style={{ width: CW, height: CW / ph.aspect }} pointerEvents="none" />
            </View>
          </View>
        )}
        {!!text && (
          <View style={s.layer} pointerEvents="box-none">
            <View {...textPan} style={[grab, { transform: [{ translateX: textPos.x }, { translateY: textPos.y }, { rotate: `${tx.rot}deg` }] }]}>
              <Text style={{ fontFamily: family(tx.font), fontSize: tx.size, color: tx.color, fontWeight: tx.bold ? '700' : '400',
                             textAlign: 'center', textShadowColor: tx.color === '#111111' ? 'transparent' : 'rgba(0,0,0,0.45)', textShadowRadius: 4 }}>
                {text}
              </Text>
            </View>
          </View>
        )}
        </View>
        <View pointerEvents="none" style={s.camera} />
      </View>

      <Text style={s.label}>1. Phone model</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ alignSelf: 'stretch' }}>
        {models.map(m => (
          <Pressable key={m.id} onPress={() => setModel(m)} style={[s.chip, model?.id === m.id && s.chipOn]}>
            <Text style={model?.id === m.id && { color: '#fff' }}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={s.label}>2. Case color</Text>
      <View style={s.row}>
        {CASE_COLORS.map(c => <Pressable key={c} onPress={() => setColor(c)} style={[s.dot, { backgroundColor: c }, color === c && s.dotOn]} />)}
      </View>

      <Text style={s.label}>3. Customize</Text>
      <View style={s.tabs}>
        {[['photo', '🖼 Photo'], ['text', 'Aa Text']].map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
            <Text style={[s.tabTxt, tab === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.panel}>
        {tab === 'photo' ? (
          <>
            <View style={s.row}>
              <Pressable style={s.btnLight} onPress={pickPhoto}><Text>{photo ? 'Change photo' : 'Upload photo'}</Text></Pressable>
              {photo && <Pressable style={s.btnLight} onPress={() => setPhoto(null)}><Text>Remove</Text></Pressable>}
            </View>
            {photo && (
              <>
                <Stepper label="Size" value={`${Math.round(ph.scale * 100)}%`}
                  onMinus={() => setPh(p => ({ ...p, scale: clamp(+(p.scale - 0.1).toFixed(2), 0.2, 4) }))}
                  onPlus={() => setPh(p => ({ ...p, scale: clamp(+(p.scale + 0.1).toFixed(2), 0.2, 4) }))} />
                <Stepper label="Rotate" value={`${ph.rot}°`} onMinus={() => rotate(setPh, -5)} onPlus={() => rotate(setPh, 5)} />
                <View style={s.row}>
                  <Pressable style={s.btnLight} onPress={fillCase}><Text>Fill the case</Text></Pressable>
                  <Pressable style={s.btnLight} onPress={() => { setPh(p => ({ ...p, scale: 1, rot: 0 })); setPhotoPos({ x: 0, y: 0 }); }}><Text>Reset</Text></Pressable>
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <TextInput style={s.input} value={text} onChangeText={setText} placeholder="Type your text..." maxLength={40} />
            <Text style={s.mini}>Font</Text>
            <View style={s.row}>
              {FONTS.map(f => (
                <Pressable key={f.id} onPress={() => setTx(t => ({ ...t, font: f }))} style={[s.chip, tx.font.id === f.id && s.chipOn]}>
                  <Text style={[{ fontFamily: family(f), fontSize: 16 }, tx.font.id === f.id && { color: '#fff' }]}>{f.id}</Text>
                </Pressable>
              ))}
            </View>
            <Stepper label="Size" value={tx.size} onMinus={() => setTx(t => ({ ...t, size: clamp(t.size - 2, 12, 90) }))} onPlus={() => setTx(t => ({ ...t, size: clamp(t.size + 2, 12, 90) }))} />
            <Stepper label="Rotate" value={`${tx.rot}°`} onMinus={() => rotate(setTx, -5)} onPlus={() => rotate(setTx, 5)} />
            <Text style={s.mini}>Color</Text>
            <View style={s.row}>
              {TEXT_COLORS.map(c => <Pressable key={c} onPress={() => setTx(t => ({ ...t, color: c }))} style={[s.dot, { backgroundColor: c }, tx.color === c && s.dotOn]} />)}
            </View>
            <View style={s.row}>
              <Pressable style={[s.chip, tx.bold && s.chipOn]} onPress={() => setTx(t => ({ ...t, bold: !t.bold }))}><Text style={[{ fontWeight: '800' }, tx.bold && { color: '#fff' }]}>Bold</Text></Pressable>
              <Pressable style={s.btnLight} onPress={() => setTextPos({ x: 0, y: 0 })}><Text>Center text</Text></Pressable>
            </View>
          </>
        )}
      </View>

      <View style={s.guide}>
        <Text style={s.shareTitle}>Price</Text>
        {[['plain', 'Plain case'], ['color', 'Colored case'], ['text', 'With text'], ['photo', 'With photo'], ['both', 'Text + photo']].map(([k, l]) => (
          <View key={k} style={s.guideRow}>
            <Text style={[s.guideTxt, k === key && s.guideOn]}>{l}</Text>
            <Text style={[s.guideTxt, k === key && s.guideOn]}>
              {k === 'both' && <Text style={s.was}>{tnd(prices.both_before)} </Text>}{tnd(prices[k])}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.shareBox}>
        <View style={{ flex: 1 }}>
          <Text style={s.shareTitle}>🌍 Show my design to everyone</Text>
          <Text style={s.shareTxt}>Cachi Store may display your design in the shop's "Community designs" for a limited time. Your name and phone number are never shown.</Text>
        </View>
        <Switch value={share} onValueChange={setShare} trackColor={{ true: '#FF6B4A' }} />
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={[s.btn, busy && { opacity: 0.5 }]} disabled={busy || !model} onPress={addToCart}>
        <Text style={s.btnText}>{busy ? 'Saving...' : <>Add to cart - {was ? <Text style={s.was}>{tnd(was)} </Text> : null}{tnd(price)}</>}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, alignItems: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', color: '#FF6B4A', fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '800', marginTop: 6, color: '#1B1B1F' },
  sub: { color: '#7a746a', marginTop: 4, textAlign: 'center' },
  case: { width: CW, height: CH, borderRadius: 42, overflow: 'hidden', backgroundColor: '#fff', marginVertical: 22,
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  camera: { position: 'absolute', top: 16, left: 16, width: 78, height: 78, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)' },
  label: { alignSelf: 'flex-start', fontWeight: '800', marginTop: 20, marginBottom: 10, fontSize: 16, color: '#1B1B1F' },
  mini: { alignSelf: 'flex-start', fontWeight: '600', color: '#7a746a', marginTop: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: '#e3ddd3', backgroundColor: '#fff', marginRight: 4 },
  chipOn: { backgroundColor: '#1B1B1F', borderColor: '#1B1B1F' },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#d8d2c8' },
  dotOn: { borderWidth: 3, borderColor: '#FF6B4A' },
  tabs: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: '#efe9df', borderRadius: 14, padding: 4 },
  tab: { flex: 1, padding: 10, borderRadius: 11, alignItems: 'center' },
  tabOn: { backgroundColor: '#1B1B1F' },
  tabTxt: { fontWeight: '700' },
  panel: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  stepLabel: { width: 70, fontWeight: '600' },
  stepBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '700' },
  stepVal: { minWidth: 64, textAlign: 'center', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e3ddd3', borderRadius: 12, padding: 14, backgroundColor: '#fff' },
  btnLight: { borderWidth: 1.5, borderColor: '#1B1B1F', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff' },
  shareBox: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 18, borderWidth: 1, borderColor: '#efe9df' },
  shareTitle: { fontWeight: '800', color: '#1B1B1F' },
  shareTxt: { color: '#7a746a', fontSize: 12, marginTop: 2 },
  guide: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 18, borderWidth: 1, borderColor: '#efe9df' },
  guideRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  guideTxt: { color: '#7a746a' },
  guideOn: { color: '#FF6B4A', fontWeight: '800' },
  was: { textDecorationLine: 'line-through', opacity: 0.7, fontWeight: '400' },
  err: { color: '#c0392b', marginTop: 16, alignSelf: 'flex-start' },
  btn: { alignSelf: 'stretch', backgroundColor: '#FF6B4A', borderRadius: 14, padding: 16, marginTop: 20, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});