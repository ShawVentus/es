// 临时调试代码 - 添加到 page.tsx 验证问题

// 在第96-109行的保存scroll的useEffect后添加：
useEffect(() => {
  const container = scrollContainerRef.current;
  console.log('🔍 [保存监听] scrollContainer:', container);
  console.log('🔍 [保存监听] 是否为null:', container === null);

  if (!container) {
    console.error('❌ scrollContainerRef.current 为 null！监听器未绑定！');
    return;
  }

  const handleScroll = () => {
    const scrollPosition = container.scrollTop;
    console.log('💾 [保存] scrollTop:', scrollPosition);
    sessionStorage.setItem('reportScrollPosition', scrollPosition.toString());
  };

  container.addEventListener('scroll', handleScroll);
  console.log('✅ scroll监听器已绑定');

  return () => {
    console.log('🗑️ scroll监听器已移除');
    container.removeEventListener('scroll', handleScroll);
  };
}, []);

// 在第112-126行的恢复scroll的useEffect后添加：
useEffect(() => {
  const container = scrollContainerRef.current;
  console.log('🔄 [恢复触发]');
  console.log('  - activeTab:', activeTab);
  console.log('  - selectedReport:', selectedReport);
  console.log('  - container:', container);
  console.log('  - container为null?', container === null);

  if (!container) {
    console.error('❌ [恢复] scrollContainerRef.current 为 null！');
    return;
  }

  if (activeTab === 'summary') {
    const savedPosition = sessionStorage.getItem('reportScrollPosition');
    console.log('💾 [恢复] sessionStorage值:', savedPosition);
    console.log('📏 [恢复] 当前scrollHeight:', container.scrollHeight);
    console.log('📏 [恢复] 当前clientHeight:', container.clientHeight);

    if (savedPosition) {
      setTimeout(() => {
        console.log('⏰ [setTimeout执行]');
        console.log('  - scrollHeight:', container.scrollHeight);
        console.log('  - 尝试设置scrollTop为:', savedPosition);
        container.scrollTop = parseInt(savedPosition, 10);
        console.log('  - 设置后实际scrollTop:', container.scrollTop);

        if (container.scrollTop !== parseInt(savedPosition, 10)) {
          console.error('⚠️ scrollTop设置失败！目标:', savedPosition, '实际:', container.scrollTop);
        }
      }, 0);
    }
  }
}, [activeTab, selectedReport]);
