from langchain_openai import ChatOpenAI
from browser_use import Agent, Browser, BrowserConfig
import kernel
from kernel import Kernel
from typing import TypedDict
import os

client = Kernel()

app = kernel.App("python-bu")

class TaskInput(TypedDict):
    task: str
    openai_api_key: str

@app.action("bu-task")
async def bu_task(ctx: kernel.KernelContext, input_data: TaskInput):
    """
    A function that runs a Browser Use agent
    
    Args:
        ctx: Kernel context containing invocation information
        input_data: An object with task and openai_api_key properties
        
    Returns:
        An object with final_result and errors properties
    """
    os.environ["OPENAI_API_KEY"] = input_data["openai_api_key"]
    
    llm = ChatOpenAI(model="gpt-4o")
    
    kernel_browser = client.browsers.create(invocation_id=ctx.invocation_id)
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)
    agent = Agent(
        #task="Compare the price of gpt-4o and DeepSeek-V3",
        task=input_data["task"],
        llm=llm,
        browser=Browser(BrowserConfig(cdp_url=kernel_browser.cdp_ws_url))
    )
    result = await agent.run()
    if result.final_result() is not None:
      return {"final_result": result.final_result()}
    return {"errors": result.errors()}
