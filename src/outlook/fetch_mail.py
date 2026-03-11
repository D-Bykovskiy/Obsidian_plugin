import win32com.client
import json
import sys
import argparse

# Force UTF-8 encoding for standard output to prevent Cyrillic characters from turning into '?'
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def fetch_emails(folder_name):
    outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
    
    # 6 refers to the Inbox. We could traverse folders to find `folder_name`
    inbox = outlook.GetDefaultFolder(6) 
    
    if folder_name and folder_name.lower() != "inbox":
        # Attempt to find the specified folder under inbox
        try:
            target_folder = inbox.Folders.Item(folder_name)
        except Exception:
            # Fallback to inbox if not found
            target_folder = inbox
    else:
        target_folder = inbox

    messages = target_folder.Items
    # Sort messages by date received, descending
    messages.Sort("[ReceivedTime]", True)
    
    emails_data = []
    
    # Fetch top 50 recent messages
    for idx, message in enumerate(messages):
        if idx >= 50:
            break
        try:
            emails_data.append({
                "entryId": message.EntryID,
                "conversationTopic": message.ConversationTopic if hasattr(message, 'ConversationTopic') else message.Subject,
                "subject": message.Subject,
                "sender": message.SenderName if hasattr(message, 'SenderName') else 'Unknown',
                "receivedDateTime": str(message.ReceivedTime),
                "bodyPreview": message.Body[:500] if message.Body else "" # Taking preview to send to LLM
            })
        except Exception as e:
            pass # Skip messages that can't be parsed

    print(json.dumps({"value": emails_data}, ensure_ascii=False))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", type=str, default="Inbox", help="Outlook folder to scan")
    args = parser.parse_args()
    
    fetch_emails(args.folder)
