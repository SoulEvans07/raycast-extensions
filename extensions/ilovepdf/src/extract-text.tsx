import {
  Form,
  ActionPanel,
  Action,
  showToast,
  getPreferenceValues,
  Toast,
  closeMainWindow,
  open,
  openExtensionPreferences,
} from "@raycast/api";
import ILovePDFApi from "@ilovepdf/ilovepdf-nodejs";
import ExtractTask from "@ilovepdf/ilovepdf-js-core/tasks/ExtractTask";
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile";
import { useState } from "react";
import { runAppleScript } from "@raycast/utils";
import fs from "fs";
import path from "path";
import { getFilePath, MaxInt32 } from "./common/utils";

type Values = {
  files: string[];
};

type Status = "init" | "success" | "failure";

const {
  APIPublicKey: publicKey,
  APISecretKey: secretKey,
  OpenNow: openNow,
  AskBeforeDownload: askBeforeDownload,
} = getPreferenceValues<Preferences>();

export default function Command() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>("init");
  const [destinationFilePath, setDestinationFilePath] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);

  async function handleSubmit(values: Values) {
    setIsLoading(true);
    if (!values.files.length) {
      await showToast(Toast.Style.Failure, "You must select a single file.", "Please select a file.");
      setStatus("failure");
      setIsLoading(false);
      return;
    }

    const toast = await showToast(Toast.Style.Animated, "Processing", "Extracting Text...");

    const file: string = values.files[0];
    const fileExtension = path.extname(file);
    const fileName = path.basename(file, fileExtension);
    const directory = path.dirname(file);
    let destinationFile = getFilePath(directory, `${fileName}_extracted.txt`);

    if (askBeforeDownload) {
      try {
        const script = `set file2save to POSIX path of (choose file name with prompt "Save the dcoument as" default location "${directory}" default name "${path.basename(destinationFile)}")`;
        destinationFile = await runAppleScript(script, { timeout: MaxInt32 });
      } catch (e) {
        console.log(e);
        const error = e as { message: string; stderr: string };
        setIsLoading(false);
        if (error.stderr.includes("User cancelled")) {
          toast.hide();
          setStatus("init");
          return;
        }
        toast.style = Toast.Style.Failure;
        toast.title = "failure";
        toast.message = `An error happened during selecting the saving directory.  Reason ${error.message}`;
        setStatus("failure");
      }
    }

    const instance = new ILovePDFApi(publicKey, secretKey);
    const task = instance.newTask("extract") as ExtractTask;

    try {
      await task.start();
      const iLovePdfFile = new ILovePDFFile(file);
      await task.addFile(iLovePdfFile);
      await task.process({ detailed: true });
      const data = await task.download();

      setDestinationFilePath(destinationFile);
      fs.writeFileSync(destinationFile, data);
      toast.style = Toast.Style.Success;
      toast.title = "success";
      toast.message = "Text extracted successfully.";
      setStatus("success");
      setIsLoading(false);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "failure";
      toast.message = `Error happened during extracting the text. Reason ${error}`;
      setStatus("failure");
      setIsLoading(false);
      console.log(error);
      return;
    }

    if (openNow) {
      await closeMainWindow();
      open(destinationFile);
    } else {
      toast.primaryAction = {
        title: "Open File",
        onAction: () => {
          open(destinationFile);
        },
      };
    }
  }

  return (
    <Form
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Extract Text" onSubmit={handleSubmit} />
          {status == "success" ? <Action.ShowInFinder title="Show in Finder" path={destinationFilePath} /> : null}
          {status == "success" ? (
            <Action.CopyToClipboard title="Copy Path to Clipboard" content={destinationFilePath} />
          ) : null}
          {status == "failure" ? (
            <Action title="Open Extension Preferences" onAction={openExtensionPreferences} />
          ) : null}
        </ActionPanel>
      }
      isLoading={isLoading}
    >
      <Form.FilePicker id="files" title="Choose a PDF" allowMultipleSelection={false} />
      <Form.Checkbox
        id="detailed"
        label="Include Detailed Extraction Info?"
        info="Includes the following PDF properties separated by a comma: PageNo, XPos, YPos, Width, FontName, FontSize, Length and Text"
        value={showDetails}
        onChange={setShowDetails}
      />
    </Form>
  );
}
