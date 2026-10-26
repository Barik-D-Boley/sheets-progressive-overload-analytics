function onEdit(e) {
  if (!e || !e.range) return;
  
  popups(e);
  pushData(e);
}