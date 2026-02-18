---
title: "部署你的第一个语言模型"
date: 2026-02-18T10:00:00+08:00
draft: false
---
根据下面的链接一步步操作
https://github.com/Hoper-J/AI-Guide-and-Demos-zh_CN/blob/master/Guide/06.%20%E5%BC%80%E5%A7%8B%E5%AE%9E%E8%B7%B5%EF%BC%9A%E9%83%A8%E7%BD%B2%E4%BD%A0%E7%9A%84%E7%AC%AC%E4%B8%80%E4%B8%AA%E8%AF%AD%E8%A8%80%E6%A8%A1%E5%9E%8B.md
vscode打开一个文件夹
conda 配置基本环境
shift+~ 打开终端，
    conda create -n torch_env python=3.10 (创建一个干净的隔离屋)
    conda activate torch_env (进入这个屋子)
在这里安装你的 torch。
pip install torch
pip install transformers
设定main.py
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# 指定模型名称
model_name = "distilgpt2"

# 加载 Tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_name)

# 加载预训练模型
model = AutoModelForCausalLM.from_pretrained(model_name)
device = torch.device("cuda" if torch.cuda.is_available() 
                      else "mps" if torch.backends.mps.is_available() 
                      else "cpu")
model.to(device)
# 设置模型为评估模式
model.eval()

# 输入文本
input_text = "Hello GPT"

# 编码输入文本
inputs = tokenizer(input_text, return_tensors="pt")
inputs = {key: value.to(device) for key, value in inputs.items()}

# 生成文本
with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_length=200,
        num_beams=5,
        no_repeat_ngram_size=2,
        early_stopping=True
    )

# 解码生成的文本
generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
print("模型生成的文本：")
print(generated_text)
结束