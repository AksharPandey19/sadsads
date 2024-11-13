const { app, BrowserWindow, BrowserView, ipcMain, nativeImage } = require('electron');
const https = require('https');

let mainWindow;
let views = [];
let activeViewIndex = 0;
let bookmarks = [];
let favicons = []; // Array to store favicons for each tab

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
  createNewTab('https://www.google.com'); // Open a default tab on launch

  mainWindow.on('resize', resizeActiveView);
  const { ipcMain } = require('electron');
  let bookmarks = [];
  
  ipcMain.on('bookmark', (event, tabTitle) => {
    bookmarks.push(tabTitle); // Add tab title to bookmarks
    event.sender.send('bookmarks-updated', bookmarks); // Send updated bookmarks list
  });
  
  ipcMain.on('close-tab', (event, index) => {
    tabs.splice(index, 1); // Remove tab by index
    event.sender.send('tabs-updated', tabs); // Update tabs list
  });
  
  ipcMain.on('navigate', (event, input) => navigate(input));
  ipcMain.on('new-tab', (event, url) => createNewTab(url || 'https://www.google.com'));
  ipcMain.on('switch-tab', (event, index) => switchTab(index));
  ipcMain.on('close-tab', (event, index) => closeTab(index));
  ipcMain.on('bookmark', () => addBookmark());
  ipcMain.on('get-tabs', (event) => event.reply('tabs-updated', getTabInfo()));
  ipcMain.on('get-bookmarks', (event) => event.reply('bookmarks-updated', bookmarks));
}

function resizeActiveView() {
  if (views[activeViewIndex]) {
    const [width, height] = mainWindow.getContentSize();
    views[activeViewIndex].setBounds({ x: 0, y: 80, width, height: height - 80 });
  }
}

function createNewTab(url) {
  const view = new BrowserView();
  mainWindow.setBrowserView(view);
  view.setBounds({ x: 0, y: 80, width: 1200, height: 720 });
  view.webContents.loadURL(url);
  views.push(view);
  favicons.push('default-favicon.png'); // Default favicon for new tab
  setActiveView(views.length - 1);

  view.webContents.on('page-title-updated', () => updateTabs());

  // Fetch favicon on page load
  view.webContents.on('did-finish-load', () => {
    fetchFavicon(view.webContents.getURL(), views.length - 1); // Pass the index to fetchFavicon
  });
}

function setActiveView(index) {
  if (views[index]) {
    mainWindow.setBrowserView(views[index]);
    resizeActiveView();
    activeViewIndex = index;
  }
}

function switchTab(index) {
  if (index >= 0 && index < views.length) {
    setActiveView(index);
    updateTabs();
  }
}

function closeTab(index) {
  if (views[index]) {
    views[index].destroy();
    views.splice(index, 1);
    favicons.splice(index, 1); // Remove favicon for the closed tab
    activeViewIndex = Math.min(activeViewIndex, views.length - 1);
    if (views.length > 0) {
      setActiveView(activeViewIndex);
    } else {
      mainWindow.loadFile('index.html');
    }
    updateTabs();
  }
}

function navigate(input) {
  const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/;
  let url = urlPattern.test(input) ? (input.startsWith('http') ? input : `https://${input}`) : `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  views[activeViewIndex].webContents.loadURL(url);
}

function addBookmark() {
  const url = views[activeViewIndex].webContents.getURL();
  if (!bookmarks.includes(url)) {
    bookmarks.push(url);
    mainWindow.webContents.send('bookmarks-updated', bookmarks);
  }
}

function fetchFavicon(url, index) {
  const view = views[index];
  const urlObject = new URL(url);
  
  // Check if the URL is from google.com
  let faviconURL;
  if (urlObject.hostname.includes('google.com')) {
    // Use Google's specific favicon URL
    faviconURL = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://google.com&size=16`;
  } else {
    // For other sites, look for the <link rel="icon"> tag
    view.webContents.executeJavaScript(`
      (() => {
        const iconLink = document.querySelector('link[rel~="icon"]');
        return iconLink ? iconLink.href : null;
      })();
    `).then(faviconLink => {
      if (faviconLink) {
        // If favicon found, download it
        downloadFavicon(faviconLink, index);
      } else {
        // If no favicon found, use the default
        favicons[index] = 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://htmlproject-seven.vercel.app/&size=16';
        updateTabs();
      }
    }).catch(error => {
      console.error("Error fetching favicon:", error);
      // Use default if there was an error
      favicons[index] = 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://htmlproject-seven.vercel.app/&size=16';
      updateTabs();
    });
    return; // Prevent fallback from triggering prematurely for other domains
  }

  // If it's Google, use the pre-defined favicon URL
  downloadFavicon(faviconURL, index);
}

function downloadFavicon(faviconURL, index) {
  https.get(faviconURL, (response) => {
    let rawData = [];
    response.on('data', (chunk) => rawData.push(chunk));
    response.on('end', () => {
      const buffer = Buffer.concat(rawData);
      const faviconImage = nativeImage.createFromBuffer(buffer);

      if (!faviconImage.isEmpty()) {
        favicons[index] = faviconImage.toDataURL();
        updateTabs();
      } else {
        // Use default favicon if download fails or image is empty
        favicons[index] = 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://htmlproject-seven.vercel.app/&size=16';
        updateTabs();
      }
    });
  }).on('error', () => {
    // Use default favicon if download fails
    favicons[index] = 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://htmlproject-seven.vercel.app/&size=16';
    updateTabs();
  });
}


function getTabInfo() {
  return views.map((view, index) => ({
    index,
    title: view.webContents.getTitle() || `Tab ${index + 1}`,
    favicon: favicons[index] || 'default-favicon.png', // Use stored favicon
  }));
}

function updateTabs() {
  mainWindow.webContents.send('tabs-updated', getTabInfo());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
