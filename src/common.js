export default class Helpers {
  
  /**
   * Verifies server path exists, and if it doesn't creates it.
   * 
   * @param  {string} startingSource - Source
   * @param  {string} path - Server path to verify
   * @returns {boolean} - true if verfied, false if unable to create/verify
   */
  static async verifyPath(startingSource, path) {
    try {
      const paths = path.split("/");
      let currentSource = paths[0];

      for(let i = 0; i < paths.length; i+=1) {
        try {
          if(currentSource !== paths[i]) {
            currentSource = `${currentSource}/${paths[i]}`; 
          }
          await Helpers.CreateDirectory(startingSource,`${currentSource}`, {bucket:null});
          
        } catch (err) {
          Helpers.logger.debug(`Error trying to verify path ${startingSource}, ${path}`, err);
        }
      }
    } catch (err) {
      return false;
    }

    return true;
  }
  
  /**
   * Exports data structure to json string
   * 
   * @param  {object} data - data to stringify
   * @returns {string} - stringified data
   */
  static exportToJSON(data) {
    const exportData = duplicate(data);
    delete data.permission;

    // if this object has a souce include it.
    if(data.flags?.["exportSource"]) {
      data.flags["exportSource"] = {
        world: game.world.id,
        system: game.system.id,
        coreVersion: game.version,
        systemVersion: game.system.version
      };
    }
    
    return JSON.stringify(data, null, "\t");
  }


  static sanitizeFilename(input, replacement) {
    var illegalRe = /[\/\?<>\\:\*\|"]/g;
    var controlRe = /[\x00-\x1f\x80-\x9f]/g;
    var reservedRe = /^\.+$/;
    var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    var windowsTrailingRe = /[\. ]+$/;

    if (typeof input !== 'string') {
      throw new Error('Input must be string');
    }
    var sanitized = input
      .replace(illegalRe, replacement)
      .replace(controlRe, replacement)
      .replace(reservedRe, replacement)
      .replace(windowsReservedRe, replacement)
      .replace(windowsTrailingRe, replacement);
    return sanitized;
  }
  
  /**
   * Exports binary file to zip file within a specific folder, excludes files in core data area
   * 
   * @param  {string} path - Path to file within VTT
   * @param  {string} type - Object type
   * @param  {string} id - Object Id
   * @param  {object} zip - Zip archive
   * @param  {string} imageType="images" - image/file type for folder name
   * @returns {string} - Path to file within zip file
   */
  static async exportImage(itempath, type, id, zip, imageType="images") {
    if(itempath) {
      let path = decodeURI(itempath);

      if(CONFIG.AIE.TEMPORARY[itempath]) {
        return CONFIG.AIE.TEMPORARY[itempath];
      } else {
        let isDataImage = true;
        try {
          const img = await JSZipUtils.getBinaryContent(itempath);
          const filename = path.replace(/^.*[\\\/]/, '')
  
          await zip.folder(type).folder(imageType).folder(id).file(filename, img, {binary:true});
          CONFIG.AIE.TEMPORARY[itempath] = `${type}/${imageType}/${id}/${filename}`;
          return `${type}/${imageType}/${id}/${filename}`;
        } catch (err) {
          Helpers.logger.debug(`Warning during ${imageType} export. ${itempath} is not in the data folder or could be a core image.`);
        }
      }
     
      return `*${path}`;
    }
  }
  
  /**
   * Imports binary file, by extracting from zip file and uploading to path.
   * 
   * @param  {string} path - Path to image within zip file
   * @param  {object} zip - Zip file
   * @returns {string} - Path to file within VTT
   */
  static async importImage(path, zip, adventure) {
      try {
          if (path[0] === "*") {
              // Core/system image, not imported—just strip the leading '*'
              return path.replace(/\*/g, "");
          } else {
              const adventurePath = (adventure.name).replace(/[^a-z0-9]/gi, '_');
              const targetPath = path.replace(/[\\\/][^\\\/]+$/, ''); // removes filename from path
              const filenameWithQuery = path.replace(/^.*[\\\/]/, '');
              const filename = filenameWithQuery.replace(/\?.*$/, ''); // strips ?cache or ?timestamp

              const cleanPath = `worlds/${game.world.id}/adventures/${adventurePath}/${targetPath}/${filename}`;

              // Only import if not already processed
              if (!CONFIG.AIE.TEMPORARY.import[path]) {
                  await Helpers.verifyPath("data", `worlds/${game.world.id}/adventures/${adventurePath}/${targetPath}`);

                  const fileObj = zip.file(path);

                  if (!fileObj) {
                      console.warn("File not found in zip:", path);
                  } else {
                      console.log("Importing image from zip:", path);
                  }

                  if (fileObj !== null) {
                      const img = await fileObj.async("uint8array");
                      const file = new File([img], filename);
                      await Helpers.UploadFile("data", `worlds/${game.world.id}/adventures/${adventurePath}/${targetPath}`, file, { bucket: null });

                      CONFIG.AIE.TEMPORARY.import[path] = true;
                      Helpers.logger.debug(`Imported: ${cleanPath}`);
                  } else {
                      Helpers.logger.warn(`Image file not found in zip: ${path}`);
                  }
              } else {
                  Helpers.logger.debug(`Already imported: ${cleanPath}`);
              }

              console.log("Returning image path:", cleanPath);
              return cleanPath;
          }
      } catch (err) {
          Helpers.logger.error(`Error importing image file ${path} : ${err.message}`);
      }

      // fallback: return original (possibly broken) path
      return path;
  }


    /**
   * Async for each loop
   * 
   * @param  {array} array - Array to loop through
   * @param  {function} callback - Function to apply to each array item loop
   */
  static async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index += 1) {
      await callback(array[index], index, array);
    }
  };

  /**
   * Attempts to find a compendium pack by name, if not found, create a new one based on item type
   * @param  {string} type - Type of compendium
   * @param  {string} name - Name of compendium
   * @returns {object} - Compendium pack
   */
  static async getCompendiumPack(type, name) {
    let pack = game.packs.find(p => {
      return p.metadata.label === name
    });
    
    if(!pack) {
      pack = await Compendium.create({ entity : type, label: name});
    }

    return pack;
  }
  
  /**
   * Find an entity by the import key.
   * @param  {string} type - Entity type to search for
   * @param  {string} id - Entity Id 
   * @returns {object} - Entity Object Data
   */
  static findEntityByImportId(type, id) {
      const collections = {
          actors: game.actors.contents,
          items: game.items.contents,
          journal: game.journal.contents,
          macros: game.macros.contents,
          scenes: game.scenes.contents,
          tables: game.tables.contents,
          playlists: game.playlists.contents,
      };
      const list = collections[type];
      if (!list) return undefined;
      return list.find(item => item.flags?.importid === id);
  }
  
  /**
   * Converts and object into an update object for entity update function
   * @param  {object} newItem - Object data
   * @returns {object} - Entity Update Object
   */
  static buildUpdateData = (newItem) => {
    let updateData = {};

    for(let key in newItem) {
      const recursiveObject = (itemkey, obj) => {
        for(let objkey in obj) {
          if(typeof obj[objkey] === "object") {
            recursiveObject(`${itemkey}.${objkey}`, obj[objkey]);
          } else {
            if(obj[objkey]) {
              const datakey = `${itemkey}.${objkey}`;
              updateData[datakey] = obj[objkey];
            }
          }
        }
      }

      if(typeof newItem[key] === "object") {
        recursiveObject(key, newItem[key]);
      } else {
        const datakey = `${key}`;
        updateData[datakey] = `${newItem[key]}`
      }
    }
    return updateData
  }

  
  /**
   * Async replace for all matching patterns
   * 
   * @param  {string} str - Original string to replace values in
   * @param  {string} regex - regex for matching
   * @param  {function} asyncFn - async function to run on each match
   * @returns {string} 
   */
  static async replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
}

  /**
   * Returns the difference between object 1 and 2
   * @param  {object} obj1
   * @param  {object} obj2
   * @returns {object}
   */
  static diff(obj1, obj2) {
    var result = {};
    for(const key in obj1) {
        if(obj2[key] != obj1[key]) result[key] = obj2[key];
        if(typeof obj2[key] == 'array' && typeof obj1[key] == 'array') 
            result[key] = this.diff(obj1[key], obj2[key]);
        if(typeof obj2[key] == 'object' && typeof obj1[key] == 'object') 
            result[key] = this.diff(obj1[key], obj2[key]);
    }
    return result;
  }

  /**
   * Read data from a user provided File object
   * @param {File} file           A File object
   * @return {Promise.<String>}   A Promise which resolves to the loaded text data
   */
  static readBlobFromFile(file) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = ev => {
        resolve(reader.result);
      };
      reader.onerror = ev => {
        reader.abort();
        reject();
      };
      reader.readAsBinaryString(file);
    });
  }

  static async importFolder(parentFolder, folders, adventure, folderList) {
    let mapping = [];

    await this.asyncForEach(folders, async f => {
      let folderData = f;

      let newfolder = game.folders.find(folder => {
          return (folder._id === folderData._id || folder.flags?.importid === folderData._id) && folder.documentName === folderData.type;
      });

      if(!newfolder) {
        if(folderData.parent !== null) {
          folderData.parent = CONFIG.AIE.TEMPORARY.folders[folderData.parent];
        } else {
          if(adventure?.options?.folders) {
            folderData.parent = CONFIG.AIE.TEMPORARY.folders["null"];
          } else {
            folderData.parent = CONFIG.AIE.TEMPORARY.folders[folderData.type];
          }
        }

        newfolder = await Folder.create(folderData);
          Helpers.logger.debug(`Created new folder ${newfolder.id} with data:`, folderData, newfolder);
      }

      CONFIG.AIE.TEMPORARY.folders[folderData.flags.importid] = newfolder.id;
      
      let childFolders = folderList.filter(folder => { return folder.parent === folderData.id });

      if(childFolders.length > 0) {
        await this.importFolder(newfolder, childFolders, adventure, folderList);
      } 
    });
  }

  /**
   * Replaces matchAll as it's not yet available in Electron App
   * @param   {string} regex  RegEx to use
   * @param   {string} string String to match on
   * @returns {Array}
   */
  static reMatchAll(regexp, string) {
    const matches = string.match(new RegExp(regexp, "gm"));
    if (matches) {
        let start = 0;
        return matches.map((group0) => {
            const match = group0.match(regexp);
            match.index = string.indexOf(group0, start);
            start = match.index;
            return match;
        });
    }
    return matches;
  }

  /**
   * Uploads a file to Foundry without the UI Notification
   * @param  {string} source
   * @param  {string} path
   * @param  {blog} file
   * @param  {object} options
   */
  static async UploadFile(source, path, file, options) {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
      return Helpers.ForgeUploadFile("forgevtt", path, file, options);
    }

    const fd = new FormData();
    fd.set("source", source);
    fd.set("target", path);
    fd.set("upload", file);
    Object.entries(options).forEach((o) => fd.set(...o));

    const request = await fetch(FilePicker.uploadURL, { method: "POST", body: fd });
    if (request.status === 413) {
      return ui.notifications.error(game.i18n.localize("FILES.ErrorTooLarge"));
    } else if (request.status !== 200) {
      return ui.notifications.error(game.i18n.localize("FILES.ErrorSomethingWrong"));
    }
  }

  /**
   * Uploads a file to Forge Asset Library without the UI Notification
   * @param  {string} source
   * @param  {string} path
   * @param  {blog} file
   * @param  {object} options
   */
  static async ForgeUploadFile(source, path, file, options) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("path", `${path}/${file.name}`);

    const response = await ForgeAPI.call("assets/upload", fd);
    if (!response || response.error) {
      ui.notifications.error(response ? response.error : "An unknown error occured accessing The Forge API");
      return false;
    } else {
      return { path: response.url };
    }
  }

  /**
   * Browse files using FilePicker
   * @param  {string} source
   * @param  {string} target
   * @param  {object} options={}
   */
  static async BrowseFiles(source, target, options = {}) {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
      if (target.startsWith(ForgeVTT.ASSETS_LIBRARY_URL_PREFIX)) source = "forgevtt";

      if( source === "forgevtt" ) {
        return Helpers.BrowseForgeFiles(source, target, options);
      }
    }

    return FilePicker.browse(source, target, options);
  }

  /**
   * Browse files using Forge API
   * @param  {string} source
   * @param  {string} target
   * @param  {object} options={}
   */
  static async BrowseForgeFiles(source, target, options = {}) {
    if (target.startsWith(ForgeVTT.ASSETS_LIBRARY_URL_PREFIX)) {
      if (options.wildcard)
          options.wildcard = target;
      target = target.slice(ForgeVTT.ASSETS_LIBRARY_URL_PREFIX.length)
      target = target.split("/").slice(1, -1).join("/") // Remove userid from url to get target path
    }

    const response = await ForgeAPI.call('assets/browse', { path: decodeURIComponent(target), options });
    if (!response || response.error) {
        ui.notifications.error(response ? response.error : "An unknown error occured accessing The Forge API");
        return { target, dirs: [], files: [], gridSize: null, private: false, privateDirs: [], extensions: options.extensions }
    }
    // TODO: Should be decodeURIComponent but FilePicker's _onPick needs to do encodeURIComponent too, but on each separate path.
    response.target = decodeURI(response.folder);
    delete response.folder;
    response.dirs = response.dirs.map(d => d.path.slice(0, -1));
    response.files = response.files.map(f => f.url);
    // 0.5.6 specific
    response.private = true;
    response.privateDirs = [];
    response.gridSize = null;
    response.extensions = options.extensions;
    return response;
  }
  /**
   * @param  {string} source
   * @param  {string} target
   * @param  {object} options={}
   */
  static async CreateDirectory(source, target, options = {}) {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
      return Helpers.ForgeCreateDirectory("forgevtt", target, options);
    }
    return FilePicker.createDirectory(source, target, options);
  }

  static async ForgeCreateDirectory(source, target, options = {}) {
    if (!target) return;
    const response = await ForgeAPI.call('assets/new-folder', { path: target });
    if (!response || response.error)
      throw new Error(response ? response.error : "Unknown error while creating directory.");
  }

  /** LOGGER */

  static logger = {
    log : (...args) => {
      console.log(`${CONFIG.AIE.module} | `, ...args);
    },
    debug: (...args) => {
      console.debug(`${CONFIG.AIE.module} | `, ...args);
    },
    warn: (...args) => {
      console.warn(`${CONFIG.AIE.module} | `, ...args);
    },
    error: (...args) => {
      console.error(`${CONFIG.module} | `, ...args, new Error().stack);
    }
  }

}
