import { PluginClient } from "@remixproject/plugin";
import { createClient } from "@remixproject/plugin-webview";
import { BehaviorSubject } from "rxjs";
import { getDependencyGraph, concatSourceFiles } from "./functions";
import copy from 'copy-to-clipboard'
import { customAction } from "@remixproject/plugin-api";

export class FlattenerPlugin extends PluginClient {
  callBackEnabled: boolean = true;
  feedback = new BehaviorSubject<string>("");
  fileName = new BehaviorSubject<string>("");
  flatFileName = new BehaviorSubject<string>("");
  filePath: string = "";
  compilationResult: any;
  flattenedSources: any;
  flattenSwitch: boolean = true;

  constructor() {
    super();
    createClient(this);
    this.methods = ["flattenAndSave", "flatten", "flattenFile"];
    this.onload()
      .then(async (x) => {
      await this.setCallBacks();
      })
      .catch(async (e) => {
        console.log("FLATTENER: ERROR CONNECTING", e);
      });
  }

  async setCallBacks() {
    let client = this;
    this.on(
      "solidity",
      "compilationFinished",
      async function (target, source, version, data) {
        console.log("compile finished", target, source, version, data);
        client.emit('statusChanged', { key: 'none' })
        client.filePath = target;
        client.compilationResult = { data, source };
        client.fileName.next(target)
        console.log(client.compilationResult)
        if (client.flattenSwitch) {
          client.flattenSwitch = false
          await client.flattenAndSave(null)
        }
      }
    );

  }

  async flattenFile(action: customAction) {
    if(!action.path[0]) return
    const file = action.path[0]
    try {
      await this.call('fileManager', 'readFile', file)
    } catch (e) {
      this.feedback.next(`${file} does not exist!`)
    }
    this.flattenSwitch = true
    await this.call('solidity', 'compile', file)
  }

  async flattenAndSave(res: any) {
    await this.flatten(res)
    await this.save()
  }

  async flatten(res: any) {
		// Get input
    if (res) {
      this.compilationResult = res;
    }
		
    this.filePath = this.compilationResult.source.target;
    const ast = this.compilationResult.data.sources;
    const sources = this.compilationResult.source.sources;
    // Process
    const dependencyGraph = getDependencyGraph(ast, this.filePath);
    console.log(dependencyGraph)
    const sortedFiles = dependencyGraph.isEmpty()
        ? [this.filePath]
        : dependencyGraph.sort().reverse();

    this.flattenedSources = concatSourceFiles(sortedFiles, sources);
      // Update UI
    this.emit('statusChanged', { key: 'succeed', type: 'success', title: 'Contract flattened' })
    this.feedback.next('Flattened contract copied to clipboard');
    await this._updateSaveButton(this.filePath)
    console.log("update button ", this.filePath)
    copy(this.flattenedSources)
  }

  async _updateSaveButton(filePath: string) {
    const filePathTokens = filePath.split('/');
    const fileNameWithExtension = filePathTokens[filePathTokens.length - 1];
    const fileNameTokens = fileNameWithExtension.split('.');
    const fileName = fileNameTokens[0];
    const flattenedFilePath = `${fileName}_flat.sol`;
    this.flatFileName.next(flattenedFilePath)
  }

  async save() {
    const path = await this._saveFile(this.filePath, this.flattenedSources);
    this.emit('statusChanged', { key: 'succeed', type: 'success', title: 'File saved' });
    this.feedback.next('File saved');
    await this.call('fileManager', 'open', path)
    return path;
  }
  
  async _saveFile(filePath: string, text: string) {
    const filePathTokens = filePath.split('/');
    const fileNameWithExtension = filePathTokens[filePathTokens.length - 1];
    const fileNameTokens = fileNameWithExtension.split('.');
    const fileName = fileNameTokens[0];
    const flattenedFilePath = `browser/${fileName}_flat.sol`;
    await this.call('fileManager', 'writeFile', flattenedFilePath, text);
    return flattenedFilePath;
  }
  
  
  
}


